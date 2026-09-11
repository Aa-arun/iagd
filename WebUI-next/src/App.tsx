import { useEffect, useState } from 'react';
import { fetchItems, type ItemsResponse } from './api';
import ItemListView from './views/ItemListView/ItemListView';

/** 一次取多少件。后端有上限（开发数据服务是 500）。 */
const PAGE_SIZE = 50;

/**
 * 根组件。
 *
 * A0：显示一条真实物品，证明工具链通了。
 * A1：显示**一列**真实物品，验证渲染逻辑。
 *
 * 数据全部来自开发数据服务（tools/devapi）读取的真实数据库，
 * 不使用 mock。
 */
export default function App() {
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // React 18 在开发模式下会把 effect 跑两遍（StrictMode 的刻意行为），
    // 所以用一个标志位防止"后返回的旧请求"覆盖新结果。
    let cancelled = false;

    fetchItems(0, PAGE_SIZE)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
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

      {data && data.items.length > 0 && <ItemListView items={data.items} />}

      {data && data.items.length === 0 && (
        <p className="app__loading">数据库里没有物品。</p>
      )}
    </main>
  );
}
