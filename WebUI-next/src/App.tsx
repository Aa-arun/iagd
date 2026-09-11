import { useEffect, useState } from 'react';
import { fetchItems, fetchI18n, type I18nMap, type ItemsResponse } from './api';
import { I18nProvider } from './i18n';
import ViewSwitcher from './views/ViewSwitcher';

/** 一次取多少件。后端有上限（开发数据服务是 500）。 */
const PAGE_SIZE = 50;

/**
 * 根组件。
 *
 * A0：显示一条真实物品，证明工具链通了。
 * A1：显示一列真实物品，验证渲染逻辑。
 * A4：视图切换——同一批数据用不同样式呈现。
 *
 * 数据与界面文案全部来自开发数据服务（tools/devapi）读取的真实数据，
 * 不使用 mock。
 */
export default function App() {
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [i18n, setI18n] = useState<I18nMap>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // React 18 在开发模式下会把 effect 跑两遍（StrictMode 的刻意行为），
    // 所以用一个标志位防止"后返回的旧请求"覆盖新结果。
    let cancelled = false;

    // 物品与翻译**一起**取：若翻译后到，界面会先闪一下 `iatag_slot_xxx`。
    Promise.all([fetchItems(0, PAGE_SIZE), fetchI18n()])
      .then(([items, translations]) => {
        if (cancelled) return;
        setData(items);
        setI18n(translations);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <I18nProvider map={i18n}>
      <main className="app">
        <header className="app__header">
          <h1 className="app__title">Item Assistant</h1>
          {data && (
            <p className="app__summary">
              显示 {data.items.length} / {data.total} 件
            </p>
          )}
        </header>

        {error && (
          <div className="app__error">
            <strong>读取数据失败</strong>
            <p>{error}</p>
            <p>
              请确认开发数据服务已启动：
              <code>node tools/devapi/server.mjs</code>
            </p>
          </div>
        )}

        {!error && !data && <p className="app__loading">加载中…</p>}

        {data && data.items.length > 0 && <ViewSwitcher items={data.items} />}

        {data && data.items.length === 0 && (
          <p className="app__loading">数据库里没有物品。</p>
        )}
      </main>
    </I18nProvider>
  );
}
