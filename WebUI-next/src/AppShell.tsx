import type { ItemsResponse, LiveMaintenance } from './api';
import { phaseLabel, taskLabel } from './model/maintenance';
import MaintenanceView from './views/MaintenanceView/MaintenanceView';
import { ItemDetailPanel, useItemDetail } from './components/ItemDetail';
import { dockedSide } from './components/ItemDetail/ItemDetailContext';
import SearchBar from './components/SearchBar/SearchBar';
import ViewToolbar from './views/ViewToolbar';
import ItemList from './views/ItemList';
import SettingsView from './views/SettingsView/SettingsView';

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
  viewId: string;
  onViewChange: (id: string) => void;
  data: ItemsResponse | null;
  error: string | null;
  onReload: () => void;
  toasts: Toast[];
  onDismissToast: (id: number) => void;
  maintenance: LiveMaintenance | null;
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
 *   └───────┴─────────────────┴───────┘
 *
 *   固定栏用 grid 的列实现，**面板是普通文档流元素**（不是 position:fixed），
 *   所以它天然在工具条下方（不顶头），宽度也与是否选中无关（始终留栏）。
 */
export default function AppShell({
  tab,
  onTabChange,
  keyword,
  onKeywordChange,
  viewId,
  onViewChange,
  data,
  error,
  onReload,
  toasts,
  onDismissToast,
  maintenance,
}: Props) {
  const searching = keyword.trim().length > 0;
  const items = data?.items ?? [];

  // 固定栏在哪一侧由详情面板的显示方式决定
  const { displayMode } = useItemDetail();
  const side = dockedSide(displayMode);

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Item Assistant</h1>
        {tab === 'items' && (
          <div className="app__header-actions">
            {data && (
              <p className="app__summary">
                {searching ? '匹配' : '显示'} {data.items.length} / {data.total} 件
              </p>
            )}
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
            <SearchBar value={keyword} onChange={onKeywordChange} />
            {items.length > 0 && <ViewToolbar viewId={viewId} onViewChange={onViewChange} />}
          </div>

          <div className="app__content" data-dock={side ?? undefined}>
            <div className="app__dock app__dock--left">
              {side === 'left' && <ItemDetailPanel />}
            </div>

            <div className="app__list">
              {error && (
                <div className="app__error">
                  <strong>读取数据失败</strong>
                  <p>{error}</p>
                  <p>请确认 IAGrim 正在运行——它提供 127.0.0.1:3031 的服务。</p>
                </div>
              )}

              {!error && !data && <p className="app__loading">加载中…</p>}

              {items.length > 0 && <ItemList items={items} viewId={viewId} />}

              {data && items.length === 0 && (
                <p className="app__loading">
                  {searching ? `没有匹配「${keyword.trim()}」的物品。` : '数据库里没有物品。'}
                </p>
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
