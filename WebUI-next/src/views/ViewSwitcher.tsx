import { useEffect, useState } from 'react';
import type IItem from '../model/item';
import { DEFAULT_VIEW_ID, ITEM_VIEWS, findView } from './registry';
import './ViewSwitcher.css';

/** localStorage 的键名。视图偏好存在浏览器本地，不动后端。 */
const STORAGE_KEY = 'iagd.itemView';

/**
 * 视图切换器：一个选择框 + 它选中的那个视图。
 *
 * 它自己**不碰数据**——`items` 由上层传进来，它只负责"选择哪个视图渲染"。
 */
export default function ViewSwitcher({ items }: { items: IItem[] }) {
  // 惰性初始化：只在首次渲染时读一次 localStorage
  const [viewId, setViewId] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_VIEW_ID,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, viewId);
  }, [viewId]);

  const view = findView(viewId);
  const View = view.component;

  return (
    <>
      <div className="view-switcher">
        <label className="view-switcher__label" htmlFor="view-select">
          视图
        </label>
        <select
          id="view-select"
          className="view-switcher__select"
          value={view.id}
          onChange={(e) => setViewId(e.target.value)}
        >
          {ITEM_VIEWS.map((v) => (
            <option key={v.id} value={v.id} title={v.description}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <View items={items} />
    </>
  );
}
