import { useEffect, useState } from 'react';
import type IItem from '../model/item';
import { useItemDetail } from '../components/ItemDetail';
import { DEFAULT_VIEW_ID, ITEM_VIEWS, findView } from './registry';
import './ViewSwitcher.css';

/** localStorage 的键名。视图偏好存在浏览器本地，不动后端。 */
const STORAGE_KEY = 'iagd.itemView';

/**
 * 视图切换器：一个选择框 + 它选中的那个视图。
 *
 * 它自己**不碰数据**——`items` 由上层传进来；
 * 详情面板的交互回调也从 Context 取，再交给视图（视图仍是纯展示组件）。
 */
export default function ViewSwitcher({ items }: { items: IItem[] }) {
  // 惰性初始化：只在首次渲染时读一次 localStorage
  const [viewId, setViewId] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_VIEW_ID,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, viewId);
  }, [viewId]);

  const { onItemHover, onItemActivate, pinnedId, displayMode, setDisplayMode } = useItemDetail();

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

        {/*
          详情面板的显示方式（使用者 2026-09-12 要求增加第二种）。
          放在视图选择旁边而不是设置页：它是"看装备时随时想换"的偏好。
        */}
        <label className="view-switcher__label" htmlFor="detail-mode-select">
          详情
        </label>
        <select
          id="detail-mode-select"
          className="view-switcher__select view-switcher__select--narrow"
          value={displayMode}
          onChange={(e) => setDisplayMode(e.target.value as 'hover' | 'docked')}
          title="浮动跟随鼠标，或固定在右侧一个框里"
        >
          <option value="hover">浮动</option>
          <option value="docked">右侧固定框</option>
        </select>
      </div>

      <View
        items={items}
        onItemHover={onItemHover}
        onItemActivate={onItemActivate}
        pinnedId={pinnedId}
      />
    </>
  );
}
