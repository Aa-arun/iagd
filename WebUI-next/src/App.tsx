import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectLive,
  fetchHealth,
  fetchI18n,
  fetchItems,
  searchItems,
  type I18nMap,
  type ItemsResponse,
  type LiveMaintenance,
} from './api';
import { phaseLabel, taskLabel } from './model/maintenance';
import MaintenanceView from './views/MaintenanceView/MaintenanceView';
import { I18nProvider } from './i18n';
import { ItemDetailPanel, ItemDetailProvider } from './components/ItemDetail';
import SearchBar from './components/SearchBar/SearchBar';
import ViewSwitcher from './views/ViewSwitcher';
import SettingsView from './views/SettingsView/SettingsView';

/** 一次取多少件。后端有上限（开发数据服务是 500）。 */
const PAGE_SIZE = 50;

/** 输入停顿多久才发请求。太短会让每敲一个字母都打一次后端。 */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * 轮询数据库总数变化的间隔。
 *
 * ⚠️ 这是 **B2（后端推送）连不上时的兜底**。正常情况下 `/ws` 会主动推
 * `itemsChanged`，那时完全不轮询。只有 WebSocket 断了才退回这里。
 *
 * 只查 1 件物品拿 `total` 做对比，很轻；一旦发现总数变了才重新查询整页，
 * 避免无谓地把整页数据反复拉一遍。
 */
const POLL_INTERVAL_MS = 4000;

/**
 * `fade` 的提示在屏幕上停留多久。
 *
 * 后端在 `AutoDismissNotifications` 打开、或程序在前台时会要求自动淡出；
 * 否则（使用者没看着窗口）留着不动，等他自己关掉——那是旧行为，沿用。
 */
const TOAST_AUTO_DISMISS_MS = 6000;

/** 一条要显示的提示。 */
interface Toast {
  id: number;
  message: string;
  level: string;
  helpUrl?: string;
}

/**
 * 根组件。
 *
 * A0 显示一条真实物品 → A1 一列 → A4 视图切换 → A5 详情面板
 * → **A3 搜索**（关键词过滤）。
 *
 * 数据与界面文案全部来自开发数据服务（tools/devapi）读取的真实数据，
 * 不使用 mock。
 */
export default function App() {
  /** 顶层页签：物品（搜索自己的装备） / 数据库（维护） / 设置 */
  const [tab, setTab] = useState<'items' | 'database' | 'settings'>('items');
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [i18n, setI18n] = useState<I18nMap>({});
  const [error, setError] = useState<string | null>(null);
  /** 自增即触发重新查询（转移物品后、或检测到数据库变化时用它刷新列表） */
  const [reloadToken, setReloadToken] = useState(0);
  /** 上一次看到的数据库物品总数；用 ref 是因为它只用于比较，不该触发渲染 */
  const knownTotalRef = useRef<number | null>(null);
  /** `/ws` 是否连着。连着就靠推送，断了才退回轮询 */
  const [live, setLive] = useState(false);
  /**
   * 维护状态，非 null 表示后端正在重建游戏数据库或重算物品属性。
   *
   * 那期间后端会把查询全部拒掉（503），因为库被清空了——照常查询会显示
   * 一个空列表，让人以为自己的物品没了。所以这里要整屏挡住，并显示进度。
   */
  const [maintenance, setMaintenance] = useState<LiveMaintenance | null>(null);

  /** 后端推来的提示。自己操作产生的反馈仍由各自的组件就地显示，不走这里。 */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, level: string, helpUrl: string | undefined, fade: boolean) => {
      const id = ++toastIdRef.current;
      setToasts((list) => [...list, { id, message, level, helpUrl }]);

      if (fade) {
        setTimeout(() => dismissToast(id), TOAST_AUTO_DISMISS_MS);
      }
    },
    [dismissToast],
  );

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // 翻译只取一次。失败也不致命——界面会退化成显示 `iatag_xxx` 原文。
  useEffect(() => {
    let cancelled = false;
    fetchI18n()
      .then((translations) => {
        if (!cancelled) setI18n(translations);
      })
      .catch(() => {
        /* 忽略：缺少翻译不影响功能 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 关键词变化 → 防抖后查询。
  // 初始 keyword 为空，所以这里也顺带完成了首次加载。
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      const q = keyword.trim();
      const request = q
        ? searchItems({ wildcard: q, offset: 0, limit: PAGE_SIZE })
        : fetchItems(0, PAGE_SIZE);

      request
        .then((res) => {
          if (cancelled) return;
          setData(res);
          setError(null);
        })
        .catch((err: Error) => {
          if (!cancelled) setError(err.message);
        });
    }, SEARCH_DEBOUNCE_MS);

    // 输入变化就取消上一次：既清掉定时器，也避免"慢的旧响应"覆盖新结果
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [keyword, reloadToken]);

  // 线 B（B2）：订阅后端的 `itemsChanged` / `maintenance` 推送。这是"在游戏里
  // 捡到东西，网页上立刻出现"的正常路径。连接由 connectLive 负责自动重连。
  useEffect(() => {
    return connectLive({
      onItemsChanged: reload,
      onMaintenance: (state) => setMaintenance(state.active ? state : null),
      onNotification: (n) => pushToast(n.message, n.level, n.helpUrl, n.fade),
      onStatus: setLive,
    });
  }, [reload, pushToast]);

  // 初次加载时补一次状态：维护只在**状态变化**时广播，所以如果页面是在
  // 维护开始之后才打开的，就永远收不到那条推送（只会看到一堆 503）。
  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((health) => {
        if (cancelled || !health.maintenance) return;

        // 带上进度字段，这样在维护中途打开页面也能看到"到哪一步了"
        setMaintenance({
          active: true,
          message: health.maintenanceMessage ?? '正在更新游戏数据库…',
          ...health.maintenanceState,
        });
      })
      .catch(() => {
        /* 忽略：连不上后端时下面的查询自己会报错 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 兜底：只有在 /ws 断开时才轮询（见 POLL_INTERVAL_MS 注释）。
  // 窗口重新获得焦点时也立刻查一次——那时可能刚重连上，推送已经错过了。
  // 维护期间不轮询：后端会一直回 503，白白刷屏。
  useEffect(() => {
    if (live || maintenance) return;

    let cancelled = false;

    const check = () => {
      if (document.visibilityState !== 'visible') return;

      // 只取 1 件，只为拿到 total
      fetchItems(0, 1)
        .then((res) => {
          if (cancelled) return;
          const previous = knownTotalRef.current;
          knownTotalRef.current = res.total;
          if (previous !== null && previous !== res.total) {
            reload();
          }
        })
        .catch(() => {
          /* 忽略：轮询失败不该弹错误（后端重启期间很常见） */
        });
    };

    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [live, maintenance, reload]);

  const searching = keyword.trim().length > 0;

  return (
    <ItemDetailProvider onTransferred={reload}>
      <I18nProvider map={i18n}>
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
                  onClick={reload}
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
              onClick={() => setTab('items')}
            >
              物品
            </button>
            <button
              type="button"
              className={tab === 'settings' ? 'is-active' : ''}
              onClick={() => setTab('settings')}
            >
              设置
            </button>
            <button
              type="button"
              className={tab === 'database' ? 'is-active' : ''}
              onClick={() => setTab('database')}
            >
              数据库
            </button>
          </nav>

          {tab === 'items' && (
            <>
              <SearchBar value={keyword} onChange={setKeyword} />

              {error && (
                <div className="app__error">
                  <strong>读取数据失败</strong>
                  <p>{error}</p>
                  <p>请确认 IAGrim 正在运行——它提供 127.0.0.1:3031 的服务。</p>
                </div>
              )}

              {!error && !data && <p className="app__loading">加载中…</p>}

              {data && data.items.length > 0 && <ViewSwitcher items={data.items} />}

              {data && data.items.length === 0 && (
                <p className="app__loading">
                  {searching ? `没有匹配「${keyword.trim()}」的物品。` : '数据库里没有物品。'}
                </p>
              )}
            </>
          )}

          {tab === 'database' && <MaintenanceView live={maintenance} />}

          {tab === 'settings' && <SettingsView />}
        </main>

        {/* ★ 详情面板全应用只有一个实例，挂在顶层 */}
        <ItemDetailPanel />

        {/*
          后端推来的提示。堆在右下角，与详情面板互不遮挡（面板固定在右侧中部）。
        */}
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
                  onClick={() => dismissToast(toast.id)}
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
      </I18nProvider>
    </ItemDetailProvider>
  );
}
