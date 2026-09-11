import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchI18n, fetchItems, searchItems, type I18nMap, type ItemsResponse } from './api';
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
 * ⚠️ 这是 **B2（后端主动推送）落地前的兜底**：目前后端没有 WebSocket，
 * 页面上的列表只是"打开页面那一刻"的快照——在游戏里拾取物品后，
 * 不刷新就永远看不到新物品（2026-09-12 的实际使用反馈）。
 *
 * 这里只查 1 件物品拿 `total` 做对比，很轻；一旦发现总数变了才重新查询整页，
 * 避免无谓地把整页数据反复拉一遍。
 */
const POLL_INTERVAL_MS = 4000;

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
  /** 顶层页签：物品（搜索自己的装备） / 设置 */
  const [tab, setTab] = useState<'items' | 'settings'>('items');
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [i18n, setI18n] = useState<I18nMap>({});
  const [error, setError] = useState<string | null>(null);
  /** 自增即触发重新查询（转移物品后、或检测到数据库变化时用它刷新列表） */
  const [reloadToken, setReloadToken] = useState(0);
  /** 上一次看到的数据库物品总数；用 ref 是因为它只用于比较，不该触发渲染 */
  const knownTotalRef = useRef<number | null>(null);

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

  // 后台数据库变化 → 自动刷新列表（B2 之前的兜底，见 POLL_INTERVAL_MS 注释）。
  // 窗口重新获得焦点时也立刻查一次：切回浏览器时不该还看着旧数据。
  useEffect(() => {
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

    const timer = setInterval(check, POLL_INTERVAL_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [reload]);

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

          {tab === 'settings' && <SettingsView />}
        </main>

        {/* ★ 详情面板全应用只有一个实例，挂在顶层 */}
        <ItemDetailPanel />
      </I18nProvider>
    </ItemDetailProvider>
  );
}
