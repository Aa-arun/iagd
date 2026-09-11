import { useEffect, useState } from 'react';
import { fetchI18n, fetchItems, searchItems, type I18nMap, type ItemsResponse } from './api';
import { I18nProvider } from './i18n';
import { ItemDetailPanel, ItemDetailProvider } from './components/ItemDetail';
import SearchBar from './components/SearchBar/SearchBar';
import ViewSwitcher from './views/ViewSwitcher';
import CollectionView from './views/CollectionView/CollectionView';
import SettingsView from './views/SettingsView/SettingsView';

/** 一次取多少件。后端有上限（开发数据服务是 500）。 */
const PAGE_SIZE = 50;

/** 输入停顿多久才发请求。太短会让每敲一个字母都打一次后端。 */
const SEARCH_DEBOUNCE_MS = 250;

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
  /** 顶层页签：物品（搜索自己的装备） / 图鉴（游戏里存在哪些物品） / 设置 */
  const [tab, setTab] = useState<'items' | 'collection' | 'settings'>('items');
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [i18n, setI18n] = useState<I18nMap>({});
  const [error, setError] = useState<string | null>(null);
  /** 自增即触发重新查询（转移物品后用它刷新列表） */
  const [reloadToken, setReloadToken] = useState(0);

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

  const searching = keyword.trim().length > 0;

  return (
    <ItemDetailProvider onTransferred={() => setReloadToken((n) => n + 1)}>
      <I18nProvider map={i18n}>
        <main className="app">
          <header className="app__header">
            <h1 className="app__title">Item Assistant</h1>
            {tab === 'items' && data && (
              <p className="app__summary">
                {searching ? '匹配' : '显示'} {data.items.length} / {data.total} 件
              </p>
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
              className={tab === 'collection' ? 'is-active' : ''}
              onClick={() => setTab('collection')}
            >
              图鉴
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

          {tab === 'collection' && <CollectionView />}

          {tab === 'settings' && <SettingsView />}
        </main>

        {/* ★ 详情面板全应用只有一个实例，挂在顶层 */}
        <ItemDetailPanel />
      </I18nProvider>
    </ItemDetailProvider>
  );
}
