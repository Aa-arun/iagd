import { useEffect, useRef } from 'react';
import type { FiltersOptions, LiveMaintenance } from './api';
import type IItem from './model/item';
import { formatRange, formatTotal } from './model/format';
import { phaseLabel, taskLabel } from './model/maintenance';
import MaintenanceView from './views/MaintenanceView/MaintenanceView';
import { ItemDetailPanel, useItemDetail } from './components/ItemDetail';
import { dockedSide } from './components/ItemDetail/ItemDetailContext';
import SearchBar from './components/SearchBar/SearchBar';
import AdvancedSearch from './components/AdvancedSearch/AdvancedSearch';
import FilterPanel from './components/FilterPanel/FilterPanel';
import ViewToolbar from './views/ViewToolbar';
import { findView } from './views/registry';
import ItemList from './views/ItemList';
import SettingsView from './views/SettingsView/SettingsView';
import { hasAnyFilter, type FilterControls } from './views/useFilters';
import type { PagingState } from './views/usePaging';

/** 一条要显示的提示。 */
export interface Toast {
  id: number;
  message: string;
  level: string;
  helpUrl?: string;
}

export type AppTab = 'items' | 'database' | 'settings';

interface Props {
  tab: AppTab;
  onTabChange: (tab: AppTab) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  /** 过滤器可选项；`null` = 还没读到 */
  filterOptions: FiltersOptions | null;
  /** 过滤面板 + 高级搜索的状态与改法 */
  filters: FilterControls;
  viewId: string;
  onViewChange: (id: string) => void;
  /** 当前要显示的物品：翻页模式 = 这一页；无限滚动 = 已累积的全部 */
  items: IItem[];
  /** 匹配总数；`null` = 还没查到。可能是 `-1`（超过后端单次上限，精确数未知） */
  total: number | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  toasts: Toast[];
  onDismissToast: (id: number) => void;
  maintenance: LiveMaintenance | null;
  /** 加载方式 / 每页条数 / 当前页 + 改它们的回调 */
  paging: PagingState;
}

/**
 * 界面骨架（布局层）。
 *
 * ★ 为什么单独一层：布局要按"详情固定栏在哪一侧"决定左边/右边留不留栏，
 *   而那个状态在 `ItemDetailProvider` 里——`App` 自己在 Provider **外面**，
 *   取不到它。所以把布局拆到这里，由 `App` 在 Provider 内部渲染它。
 *
 * ★ 布局的骨架（使用者 2026-09-12 要求"滚动只发生在列表那个框里、
 *   表头不动"）：
 *
 *   ┌─────────────────────────────────┐
 *   │ header / tabs        flex: none │ ← 不滚
 *   │ 搜索 + 视图工具条     flex: none │ ← 不滚
 *   ├───────┬─────────────────┬───────┤
 *   │ 左栏  │ 物品列表         │ 右栏  │ ← 只有列表自己 overflow-y
 *   │(可选) │ (独立滚动)       │(可选) │
 *   │       ├─────────────────┤       │
 *   │       │ 翻页控件(可选)    │       │ ← 也不滚
 *   └───────┴─────────────────┴───────┘
 *
 *   固定栏用 grid 的列实现，**面板是普通文档流元素**（不是 position:fixed），
 *   所以它天然在工具条下方（不顶头），宽度也与是否选中无关（始终留栏）。
 *
 * ★ 2026-09-12 新增分页：中间那一列变成了一个 flex 纵向容器
 *   （`.app__list-col`）——上半是列表（自己滚），下半是翻页控件（不动）。
 */
export default function AppShell({
  tab,
  onTabChange,
  keyword,
  onKeywordChange,
  filterOptions,
  filters,
  viewId,
  onViewChange,
  items,
  total,
  loading,
  error,
  onReload,
  toasts,
  onDismissToast,
  maintenance,
  paging,
}: Props) {
  const searching = keyword.trim().length > 0;
  const filtered = hasAnyFilter(filters.selected, filters.advanced);
  const shown = items.length;

  // 固定栏在哪一侧由详情面板的显示方式决定
  const { displayMode } = useItemDetail();

  /*
   * 有些视图（如「详细对照」）本身就把完整属性摊开了，"详情"面板没有意义。
   * 那种视图下**不留侧栏、也不挂面板**——只是不显示，`displayMode` 原样保留，
   * 切回别的视图时会自然恢复。
   */
  const side = findView(viewId).showsFullStats ? null : dockedSide(displayMode);

  const { loadMode, loadMore, hasMore, loadingMore } = paging;

  /** 列表滚动容器。无限滚动的哨兵要观察它，所以得有引用 */
  const listRef = useRef<HTMLDivElement>(null);
  /** 列表末尾的哨兵元素——它进入视口就代表"快滚到底了" */
  const sentinelRef = useRef<HTMLDivElement>(null);

  /*
   * 无限滚动的触发点。
   *
   * 用 IntersectionObserver 而不是监听 scroll：滚动事件每秒能触发上百次，
   * 还得自己算"距离底部还有多少像素"；观察器由浏览器在布局阶段统一算，
   * 只在**跨越阈值**时回调一次，省事也更准。
   *
   * root 必须显式指定成列表容器——默认是视口，而这里的滚动发生在容器内部，
   * 不指定的话哨兵"进入视口"的条件永远成立（它一直在视口里），会疯狂触发。
   *
   * ⚠️ 依赖里有 `shown`：每次追加之后要重新观察。因为哨兵可能在追加后
   *   仍在视口内（列表还没填满一屏），这时需要再触发一次继续填。
   */
  useEffect(() => {
    // 翻页模式不需要；已经到底了也不用再盯着
    if (loadMode !== 'scroll' || !hasMore) return;

    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      // 提前 300px 就开取，滚到底时下一批已经到了，观感更连续
      { root, rootMargin: '0px 0px 300px 0px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMode, hasMore, loadMore, shown]);

  /*
   * 右上角的统计文案。
   *
   * 三种情形差别不小，所以集中在这里算，别散在 JSX 里：
   * - 翻页：说清"第几页 / 共几页、在看第几件到第几件"
   * - 无限滚动：没有"页"的概念，说"已加载多少 / 共多少"
   * - 总数未知（物品超过后端单次上限）：总数写成 `1000+`，页数干脆不显示
   */
  const totalLabel = total === null ? '' : formatTotal(total);

  let summary = '';
  if (total !== null) {
    if (loadMode === 'paged') {
      const pageCount =
        total >= 0 ? Math.max(1, Math.ceil(total / paging.pageSize)) : null;
      const pageLabel =
        pageCount !== null ? `${paging.page + 1} / ${pageCount}` : `${paging.page + 1}`;
      const range = formatRange(paging.page * paging.pageSize + 1, shown);
      summary = `第 ${pageLabel} 页 · ${range ? `显示 ${range} / ` : ''}共 ${totalLabel} 件`;
    } else if (searching) {
      // 搜索时"共多少"才是重点，已加载多少是次要信息
      summary = `匹配 ${totalLabel} 件 · 已加载 ${shown} 件`;
    } else {
      summary = `已加载 ${shown} / ${totalLabel} 件`;
    }
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Item Assistant</h1>
        {tab === 'items' && (
          <div className="app__header-actions">
            {summary && <p className="app__summary">{summary}</p>}
            <button
              type="button"
              className="app__refresh"
              onClick={onReload}
              title="重新读取数据库"
            >
              刷新
            </button>
          </div>
        )}
      </header>

      <nav className="app__tabs">
        <button
          type="button"
          className={tab === 'items' ? 'is-active' : ''}
          onClick={() => onTabChange('items')}
        >
          物品
        </button>
        <button
          type="button"
          className={tab === 'settings' ? 'is-active' : ''}
          onClick={() => onTabChange('settings')}
        >
          设置
        </button>
        <button
          type="button"
          className={tab === 'database' ? 'is-active' : ''}
          onClick={() => onTabChange('database')}
        >
          数据库
        </button>
      </nav>

      {tab === 'items' && (
        <>
          {/* 工具条固定在列表外面，所以滚列表时它不动 */}
          <div className="app__toolbar">
            {/* 搜索框与高级搜索按钮同一行：两者都是"怎么查"，与下面那排"怎么看"分开 */}
            <div className="app__search-row">
              <SearchBar value={keyword} onChange={onKeywordChange} />
              <AdvancedSearch options={filterOptions} filters={filters} />
            </div>
            {shown > 0 && (
              <ViewToolbar viewId={viewId} onViewChange={onViewChange} paging={paging} />
            )}
          </div>

          {/*
            过滤面板**无条件渲染**：过滤太严导致列表为空时，它正是使用者唯一的出路
            （收起状态下那个"清除"按钮始终可用）。
          */}
          <FilterPanel options={filterOptions} filters={filters} />

          <div className="app__content" data-dock={side ?? undefined}>
            <div className="app__dock app__dock--left">
              {side === 'left' && <ItemDetailPanel />}
            </div>

            {/* 中间一列：上面是列表（自己滚），下面是翻页控件（不滚） */}
            <div className="app__list-col">
              <div className="app__list" ref={listRef}>
                {error && (
                  <div className="app__error">
                    <strong>读取数据失败</strong>
                    <p>{error}</p>
                    <p>请确认 IAGrim 正在运行——它提供 127.0.0.1:3031 的服务。</p>
                  </div>
                )}

                {!error && loading && shown === 0 && <p className="app__loading">加载中…</p>}

                {shown > 0 && <ItemList items={items} viewId={viewId} />}

                {!error && !loading && shown === 0 && (
                  <p className="app__loading">
                    {filtered
                      ? '没有符合当前过滤条件的物品。'
                      : searching
                        ? `没有匹配「${keyword.trim()}」的物品。`
                        : '数据库里没有物品。'}
                  </p>
                )}

                {/*
                  无限滚动的哨兵：滚到这里就自动取下一批。
                  它就在滚动容器**内部**末尾，所以不会随详情面板之类的布局跑偏。
                */}
                {loadMode === 'scroll' && shown > 0 && (
                  <div className="app__sentinel" ref={sentinelRef}>
                    {loadingMore
                      ? '正在加载更多…'
                      : hasMore
                        ? ''
                        : `已显示全部 ${totalLabel} 件`}
                  </div>
                )}
              </div>

              {loadMode === 'paged' && (
                <Pager paging={paging} total={total ?? 0} shown={shown} loading={loading} />
              )}
            </div>

            <div className="app__dock app__dock--right">
              {side === 'right' && <ItemDetailPanel />}
            </div>
          </div>
        </>
      )}

      {tab === 'database' && (
        <div className="app__page">
          <MaintenanceView live={maintenance} />
        </div>
      )}

      {tab === 'settings' && (
        <div className="app__page">
          <SettingsView />
        </div>
      )}

      {toasts.length > 0 && (
        <div className="app__toasts" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast--${toast.level}`}>
              <span className="toast__message">{toast.message}</span>
              {toast.helpUrl && (
                <a className="toast__link" href={toast.helpUrl} target="_blank" rel="noreferrer">
                  帮助
                </a>
              )}
              <button
                type="button"
                className="toast__close"
                onClick={() => onDismissToast(toast.id)}
                title="关闭"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/*
        维护遮罩：后端正在重建游戏数据库（清库 + 解析几分钟）。
        这期间它会把查询全部拒掉，与其让页面显示"读取失败"或一个空列表，
        不如直接说清楚在干什么、要等多久。
      */}
      {maintenance && (
        <div className="app__maintenance" role="alertdialog" aria-live="polite">
          <div className="app__maintenance-card">
            <h2>{taskLabel(maintenance.task)}</h2>
            <p>这期间界面无法查询物品，完成后会自动恢复，不需要刷新页面。</p>

            <div className="app__maintenance-bar">
              <div
                className="app__maintenance-bar-fill"
                style={{ width: `${maintenance.percent ?? 0}%` }}
              />
            </div>

            <p className="app__maintenance-phase">
              {phaseLabel(maintenance.phase) || maintenance.message}
              {maintenance.phaseCount && maintenance.phaseCount > 1
                ? ` · 第 ${maintenance.phaseNumber} / ${maintenance.phaseCount} 步`
                : ''}
              {` · ${maintenance.percent ?? 0}%`}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * 翻页控件。
 *
 * 它在 `.app__list-col` 的**下半部分**，不在滚动容器里——所以滚列表时它不动，
 * 跟工具条是一个道理。
 *
 * ★ 页码的边界情况：物品被取走后总数会缩水，可能出现"当前页已经空了"。
 *   那种情况由 `App` 的查询流程自愈（退回最后一页），这里只负责禁用按钮。
 */
function Pager({
  paging,
  total,
  shown,
  loading,
}: {
  paging: PagingState;
  total: number;
  shown: number;
  loading: boolean;
}) {
  const { page, pageSize, hasMore, setPage } = paging;

  // 总数未知（-1，超过后端单次上限）时算不出总页数，就不显示分母
  const pageCount = total >= 0 ? Math.max(1, Math.ceil(total / pageSize)) : null;

  return (
    <div className="app__pager">
      <button
        type="button"
        className="app__pager-btn"
        disabled={page === 0 || loading}
        onClick={() => setPage(page - 1)}
      >
        ← 上一页
      </button>

      <span className="app__pager-info">
        第 {page + 1}
        {pageCount !== null ? ` / ${pageCount}` : ''} 页
        {loading ? ' · 加载中…' : ''}
      </span>

      <button
        type="button"
        className="app__pager-btn"
        disabled={!hasMore || loading}
        onClick={() => setPage(page + 1)}
      >
        下一页 →
      </button>

      <span className="app__pager-count">{shown} 件</span>
    </div>
  );
}
