import { useCallback, useEffect, useRef, useState } from 'react';
import type { FiltersOptions, LiveMaintenance } from './api';
import type IItem from './model/item';
import { formatRange, formatTotal } from './model/format';
import { phaseLabel, taskLabel } from './model/maintenance';
import MaintenanceView from './views/MaintenanceView/MaintenanceView';
import { ItemDetailPanel, useItemDetail } from './components/ItemDetail';
import { dockedSide } from './components/ItemDetail/ItemDetailContext';
import SearchBar from './components/SearchBar/SearchBar';
import { AdvancedSearchButton, AdvancedSearchDialog } from './components/AdvancedSearch/AdvancedSearch';
import FilterPanel from './components/FilterPanel/FilterPanel';
import FilterDialog from './components/FilterDialog/FilterDialog';
import ViewToolbar from './views/ViewToolbar';
import { findView } from './views/registry';
import ItemList from './views/ItemList';
import SettingsView from './views/SettingsView/SettingsView';
import { countFilters, hasAnyFilter, type FilterControls } from './views/useFilters';
import type { PagingState } from './views/usePaging';
import type { SortState } from './views/useSort';
import { isTypingTarget, useUiPrefs } from './prefs/UiPrefs';

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
  /** **过滤器**（过滤面板）的条件：作用在搜索结果之上 */
  filters: FilterControls;
  /** **搜索条件**（高级搜索里的那些选项 + 关键词）：决定搜出来什么，与过滤器无关 */
  search: FilterControls;
  viewId: string;
  onViewChange: (id: string) => void;
  /** 排序偏好（工具条上的下拉） */
  sort: SortState;
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
 * ★ 2026-09-13 新增三件事（使用者要求）：
 *   1. **快捷键**：/ 聚焦搜索框、f 过滤、s 高级搜索、i 专注模式。
 *      键位可在设置里改（见 prefs/UiPrefs.tsx）。
 *   2. **专注模式**：整页只剩列表，右上角一个退出按钮；s 仍弹高级搜索，
 *      f 弹出"过滤器 + 视图工具条"的对话框（见 components/FilterDialog）。
 *   3. **浮动详情修好了**：以前 `hover` 模式下两个 `app__dock` 都是空判断，
 *      面板根本没挂载——所以"浮动"没有任何 hover 会出现（使用者报的 bug）。
 */
export default function AppShell({
  tab,
  onTabChange,
  keyword,
  onKeywordChange,
  filterOptions,
  filters,
  search,
  viewId,
  onViewChange,
  sort,
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
  /*
   * 三种"有没有在筛"要分开算，因为它们的去处不同：
   *   - `hasKeyword`：搜索框里有没有词
   *   - `searched`：搜索侧总共有没有在筛（关键词或高级搜索条件）→ 决定要不要显示「退出搜索」
   *   - `filtered`：过滤面板有没有在筛 → 决定折叠头上的角标与空列表的文案
   */
  const hasKeyword = keyword.trim().length > 0;
  const filtered = hasAnyFilter(filters.selected, filters.advanced);
  const searched = hasKeyword || hasAnyFilter(search.selected, search.advanced);
  /** 高级搜索按钮上的角标：它自己加了几条条件（关键词不算，那是搜索框的事） */
  const searchBadge = countFilters(search.selected, search.advanced);
  const shown = items.length;

  // 固定栏在哪一侧由详情面板的显示方式决定
  const { displayMode } = useItemDetail();
  const view = findView(viewId);

  /*
   * 有些视图（如「详细对照」）本身就把完整属性摊开了，"详情"面板没有意义。
   * 那种视图下**不留侧栏、也不挂面板**——只是不显示，偏好原样保留，
   * 切回别的视图时会自然恢复。
   *
   * ★ 各视图允许的详情方式不同（分栏列表只有左右固定栏、简洁卡片含浮动，
   *   见 views/types.ts 的 detailModes）。`useItemDetail()` 给出的
   *   `displayMode` **已经是收敛过的、当前真正生效的模式**（Provider 收
   *   `detailModes` 时处理），这里直接信它。
   */
  const side = view.showsFullStats ? null : dockedSide(displayMode);
  /** 浮动模式：面板不占栏位，但必须**挂载**，否则 hover 什么也不会出现 */
  const floatingPanel = !view.showsFullStats && displayMode === 'hover';

  /** 过滤面板是否展开（f 键也要能开合，所以状态提到这里） */
  const [filterOpen, setFilterOpen] = useState(false);
  /** 高级搜索弹窗 */
  const [advOpen, setAdvOpen] = useState(false);
  /** 专注模式 */
  const [focusMode, setFocusMode] = useState(false);
  /** 专注模式下的「过滤器 + 视图」弹窗 */
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);

  /** 搜索框引用：`/` 要能直接聚焦它 */
  const searchRef = useRef<HTMLInputElement>(null);

  const { prefs } = useUiPrefs();
  const { shortcuts } = prefs;

  /** 换页签就退出专注模式：那个模式是"看物品"专用的（其它页没有列表） */
  const changeTab = useCallback(
    (next: AppTab) => {
      setFocusMode(false);
      setFilterDialogOpen(false);
      onTabChange(next);
    },
    [onTabChange],
  );

  const leaveFocus = useCallback(() => {
    setFocusMode(false);
    setFilterDialogOpen(false);
    setAdvOpen(false);
  }, []);

  /**
   * 「退出搜索」：清掉关键词 + 高级搜索条件，回到没搜索过的列表。
   *
   * ★ 刻意**不动过滤器**：搜索与过滤是两套东西（使用者 2026-09-13 澄清），
   *   过滤器有自己的「清除」。要是这里连过滤器一起清，就等于替人做了决定。
   */
  const clearSearchConditions = search.clear;
  const exitSearch = useCallback(() => {
    onKeywordChange('');
    clearSearchConditions();
  }, [onKeywordChange, clearSearchConditions]);

  /*
   * 全局快捷键（使用者 2026-09-13 要求，键位可在设置里改）。
   *
   * ⚠️ 三个"不要抢"的规则：
   *   1. 焦点在输入框 / 下拉里时直接放行 —— 否则搜索框里打不出 s、f、i、c。
   *   2. 弹窗开着时，**关闭类**的键（s 关高级搜索、f 关过滤器）仍然生效，
   *      其余（Enter / Esc / c）交给弹窗自己处理。
   *   3. `c`（清除过滤条件）放在**所有自定义快捷键之后**：万一有人把某个功能
   *      设成 c，那个功能优先，不会和清除动作打架。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      // ── 弹窗开着：放行"关掉它 / 切到另一个弹窗 / 退出专注模式" ──
      if (advOpen) {
        if (key === shortcuts.advanced) {
          e.preventDefault();
          setAdvOpen(false);
        } else if (key === shortcuts.filter) {
          // s 与 f 之间可以直接来回切，不用先关一个再开另一个
          e.preventDefault();
          setAdvOpen(false);
          if (focusMode) setFilterDialogOpen(true);
          else setFilterOpen((v) => !v);
        } else if (focusMode && key === shortcuts.focus) {
          e.preventDefault();
          leaveFocus();
        }
        return;
      }
      if (filterDialogOpen) {
        if (key === shortcuts.filter) {
          e.preventDefault();
          setFilterDialogOpen(false);
        } else if (key === shortcuts.advanced) {
          e.preventDefault();
          setFilterDialogOpen(false);
          setAdvOpen(true);
        } else if (focusMode && key === shortcuts.focus) {
          e.preventDefault();
          leaveFocus();
        }
        return;
      }

      if (key === 'escape') {
        if (focusMode) {
          e.preventDefault();
          leaveFocus();
        }
        return;
      }

      if (key === shortcuts.search) {
        // 专注模式下没有搜索框：退而打开高级搜索（它顶部就是搜索框）
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        else setAdvOpen(true);
        return;
      }

      if (key === shortcuts.filter) {
        e.preventDefault();
        if (focusMode) setFilterDialogOpen((v) => !v);
        else setFilterOpen((v) => !v);
        return;
      }

      if (key === shortcuts.advanced) {
        e.preventDefault();
        // 专注模式与非专注模式都要能开——弹窗本身由 AppShell 渲染，
        // 不再挂在工具条里（挂在里面的话专注模式下工具条不渲染，按 s 会毫无反应）
        setAdvOpen((v) => !v);
        return;
      }

      if (key === shortcuts.focus) {
        e.preventDefault();
        if (focusMode) leaveFocus();
        else setFocusMode(true);
        return;
      }

      /*
       * c = 清除**过滤器**的全部条件（使用者 2026-09-13 要求）。
       *
       * ⚠️ 弹窗开着时的 c 是另一回事：高级搜索里清的是"搜索条件草稿"、
       *    过滤器弹窗里清的是过滤器——那两处由弹窗自己处理，上面已经 return 了。
       */
      if (key === 'c') {
        e.preventDefault();
        filters.clear();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advOpen, filterDialogOpen, focusMode, leaveFocus, shortcuts, filters]);

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
    } else if (searched) {
      // 搜索时"共多少"才是重点，已加载多少是次要信息
      summary = `匹配 ${totalLabel} 件 · 已加载 ${shown} 件`;
    } else {
      summary = `已加载 ${shown} / ${totalLabel} 件`;
    }
  }

  /** 工具条：非专注模式在搜索行下面，专注模式下搬进 FilterDialog */
  const viewToolbar = <ViewToolbar viewId={viewId} onViewChange={onViewChange} paging={paging} sort={sort} />;

  return (
    <main className={`app${focusMode ? ' app--focus' : ''}`}>
      {!focusMode && (
        <header className="app__header">
          <h1 className="app__title">Item Assistant</h1>
          {tab === 'items' && (
            <div className="app__header-actions">
              {summary && <p className="app__summary">{summary}</p>}
              <button
                type="button"
                className="app__refresh"
                onClick={() => setFocusMode(true)}
                title={`专注模式：整页只留物品列表（快捷键 ${shortcuts.focus}）`}
              >
                专注模式
              </button>
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
      )}

      {focusMode && (
        <div className="app__focus-actions">
          {/*
            专注模式下没有搜索行，"退出搜索"就挪到右上角。
            没在搜索时不显示——右上角常驻两个按钮会挡住列表。
          */}
          {searched && (
            <button
              type="button"
              className="app__focus-exit"
              onClick={exitSearch}
              title="退出搜索：清空关键词与高级搜索的条件，回到全部装备（过滤器不受影响）"
            >
              退出搜索
            </button>
          )}
          <button
            type="button"
            className="app__focus-exit"
            onClick={leaveFocus}
            title={`退出专注模式（Esc 或 ${shortcuts.focus}）`}
          >
            退出专注模式
          </button>
        </div>
      )}

      {!focusMode && (
        <nav className="app__tabs">
          <button
            type="button"
            className={tab === 'items' ? 'is-active' : ''}
            onClick={() => changeTab('items')}
          >
            物品
          </button>
          <button
            type="button"
            className={tab === 'settings' ? 'is-active' : ''}
            onClick={() => changeTab('settings')}
          >
            设置
          </button>
          <button
            type="button"
            className={tab === 'database' ? 'is-active' : ''}
            onClick={() => changeTab('database')}
          >
            数据库
          </button>
        </nav>
      )}

      {tab === 'items' && (
        <>
          {/* 工具条固定在列表外面，所以滚列表时它不动 */}
          {!focusMode && (
            <div className="app__toolbar">
              {/* 搜索框与高级搜索按钮同一行：两者都是"怎么查"，与下面那排"怎么看"分开 */}
              <div className="app__search-row">
                <SearchBar value={keyword} onChange={onKeywordChange} inputRef={searchRef} />
                <AdvancedSearchButton badge={searchBadge} onClick={() => setAdvOpen(true)} />
                {/*
                  只有"正在搜索"时才出现：它清的是**搜索**（关键词 + 高级搜索条件），
                  与过滤器的「清除」是两回事。
                */}
                {searched && (
                  <button
                    type="button"
                    className="app__exit-search"
                    onClick={exitSearch}
                    title="退出搜索：清空关键词与高级搜索的条件，回到全部装备（过滤器不受影响）"
                  >
                    退出搜索
                  </button>
                )}
              </div>
              {/*
                ★ 2026-09-13：工具条**不再**随列表为空而消失。
                  过滤太严时它一消失，整页布局就跳一次（使用者报的"一直在变在动"），
                  而且此时恰恰最需要它——要改视图/排序才能看出问题。
              */}
              {viewToolbar}
            </div>
          )}

          {/*
            过滤面板**无条件渲染**：过滤太严导致列表为空时，它正是使用者唯一的出路
            （收起状态下那个"清除"按钮始终可用）。专注模式下它被搬进 f 弹窗。
          */}
          {!focusMode && (
            <FilterPanel
              options={filterOptions}
              filters={filters}
              open={filterOpen}
              onToggle={() => setFilterOpen((v) => !v)}
            />
          )}

          {/*
            `data-view` 让布局按**视图**分开（使用者 2026-09-14）：
            分栏列表宽屏要"列表居中 + 对侧留空"，简洁卡片则是"固定栏占一侧、
            另一侧卡片铺满"，两者不能用同一套列宽规则。
          */}
          <div className="app__content" data-view={viewId} data-dock={side ?? undefined}>
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
                    {searched && filtered
                      ? '没有同时符合当前搜索与过滤条件的物品。'
                      : searched
                        ? hasKeyword
                          ? `没有匹配「${keyword.trim()}」的物品。`
                          : '没有符合当前搜索条件的物品。'
                        : filtered
                          ? '没有符合当前过滤条件的物品。'
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

          {/*
            浮动模式的详情面板：它 `position: fixed` 跟随触发元素，不占布局。
            ★ 必须放在 `app__dock` 之外——dock 只在固定栏模式下才渲染面板。
          */}
          {floatingPanel && <ItemDetailPanel />}
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

      {/*
        高级搜索弹窗：由 AppShell 渲染（**不挂在工具条里**）——专注模式下工具条
        整个不渲染，挂在里面的话按 s 会毫无反应（使用者报的正是这个）。

        「完成」写回的是**搜索条件**（关键词 + 高级搜索那一套），**不碰过滤器**。
      */}
      {tab === 'items' && advOpen && (
        <AdvancedSearchDialog
          options={filterOptions}
          search={search}
          keyword={keyword}
          onApply={(nextKeyword, nextState) => {
            onKeywordChange(nextKeyword);
            search.replace(nextState);
            setAdvOpen(false);
          }}
          onClose={() => setAdvOpen(false)}
        />
      )}

      {/* 专注模式的 f 弹窗：过滤器 + 视图工具条（实时生效） */}
      {tab === 'items' && filterDialogOpen && (
        <FilterDialog
          options={filterOptions}
          filters={filters}
          viewId={viewId}
          onViewChange={onViewChange}
          paging={paging}
          sort={sort}
          onClose={() => setFilterDialogOpen(false)}
        />
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
