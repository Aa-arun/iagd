import { useEffect, useState } from 'react';
import { DEFAULT_VIEW_ID } from './registry';

/** localStorage 的键名。视图偏好存在浏览器本地，不动后端。 */
const STORAGE_KEY = 'iagd.itemView';

/**
 * 当前视图的选择（下拉框用哪一个）+ 持久化。
 *
 * 提到 hook 里是因为**工具条与列表是两个组件**了（工具条要固定在列表外面，
 * 这样滚动列表时它不动），但两者都需要知道当前是哪个视图。
 */
export function useItemView() {
  // 惰性初始化：只在首次渲染时读一次 localStorage
  const [viewId, setViewId] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_VIEW_ID,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, viewId);
  }, [viewId]);

  return { viewId, setViewId };
}
