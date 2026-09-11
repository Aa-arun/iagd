import { useEffect, useState } from 'react';
import { fetchItems, type ItemsResponse } from './api';
import ItemCard from './components/ItemCard/ItemCard';

/**
 * 根组件。
 *
 * A0 的目标只有一个：**证明工具链是通的**——
 * 浏览器打开 localhost:3000，能看到**一条来自真实数据库**的物品。
 *
 * 之所以不像原计划那样先硬编码一条假物品：开发数据服务（tools/devapi）
 * 已经可用，直接读真实数据能顺带验证通信层，少写一遍注定要删的假数据。
 */
export default function App() {
  const [data, setData] = useState<ItemsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // React 18 在开发模式下会把 effect 跑两遍（StrictMode 的刻意行为），
    // 所以用一个标志位防止"后返回的旧请求"覆盖新结果。
    let cancelled = false;

    fetchItems(0, 1)
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
        {data && <p className="app__summary">数据库里共有 {data.total} 件物品</p>}
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

      {data &&
        (data.items.length > 0 ? (
          <ItemCard item={data.items[0]} />
        ) : (
          <p className="app__loading">数据库里没有物品。</p>
        ))}
    </main>
  );
}
