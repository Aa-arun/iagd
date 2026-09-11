import { useEffect, useState } from 'react';
import { fetchCollection, iconUrl, type CollectionResponse } from '../../api';
import { qualityClass } from '../../components/ItemCard/quality';
import type ICollectionItem from '../../model/collection';
import './CollectionView.css';

/** 每次取多少条（图鉴有 3500+ 条，一次全拉没必要） */
const PAGE_SIZE = 100;

/**
 * 图鉴页面。
 *
 * 与「物品」页不同，它是**页面级**组件，自己负责加载数据：
 * 图鉴回答的是"游戏里存在哪些物品"，与玩家拥有什么无关，也不受搜索条件影响。
 *
 * 数据来自 `/api/collection`（对应原 `RequestCollectionData()`）。
 * 每条包含：物品名、品质、图标，以及**普通/硬核模式下各拥有几件**。
 */
export default function CollectionView() {
  const [data, setData] = useState<CollectionResponse | null>(null);
  const [items, setItems] = useState<ICollectionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCollection(0, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setItems(res.items);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = () => {
    if (!data || loading) return;
    setLoading(true);
    fetchCollection(items.length, PAGE_SIZE)
      .then((res) => setItems((prev) => [...prev, ...res.items]))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  if (error) {
    return <p className="app__loading">读取图鉴失败：{error}</p>;
  }

  if (!data) {
    return <p className="app__loading">加载中…</p>;
  }

  return (
    <>
      <p className="app__summary">
        共 {data.total} 条，已显示 {items.length} 条
      </p>

      <ul className="collection-list">
        {items.map((entry) => (
          <li className="collection-row" key={entry.baseRecord}>
            {entry.icon ? (
              <img
                className="collection-row__icon"
                src={iconUrl(entry.icon)}
                alt=""
                width={32}
                height={32}
                loading="lazy"
              />
            ) : (
              <span className="collection-row__icon" />
            )}

            <span className={`collection-row__name ${qualityClass(entry.quality)}`}>
              {entry.name}
            </span>

            <span className="collection-row__quality">{entry.quality}</span>

            {/* 拥有数量是这一页的重点：0 表示"见过但还没打到" */}
            <span
              className={`collection-row__owned ${entry.numOwnedSc > 0 ? 'is-owned' : ''}`}
              title="普通模式 / 硬核模式 的拥有数量"
            >
              {entry.numOwnedSc} / {entry.numOwnedHc}
            </span>
          </li>
        ))}
      </ul>

      {items.length < data.total && (
        <button type="button" className="collection-more" disabled={loading} onClick={loadMore}>
          {loading ? '加载中…' : `加载更多（还剩 ${data.total - items.length} 条）`}
        </button>
      )}
    </>
  );
}
