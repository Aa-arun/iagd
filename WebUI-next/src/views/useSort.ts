import { useCallback, useEffect, useState } from 'react';
import type { SortBy } from '../api';

/**
 * 排序偏好（使用者 2026-09-13 要求：从高级搜索搬到视图工具条）。
 *
 * ★ 它是**视图偏好**、不是过滤条件：不参与"已选 N 项"的计数，也不该被
 *   "清除过滤条件"清掉。所以它和视图 / 分页一样只是 localStorage 里的一个偏好。
 *
 * 四级排序的定义（谁在前就先按谁排，后面的是同值时的次序）：
 *
 * | 选项 | 次序 |
 * |---|---|
 * | 入库时间 | 入库时间（新 → 旧） |
 * | 品质 | 品质 → 等级 → 名称 |
 * | 等级 | 等级 → 品质 → 名称 |
 * | 名称 | 名称 → 品质 → 等级 |
 *
 * ⚠️ 真正的 SQL 由后端拼（`PlayerItemDaoImpl.BuildOrderBy`）：这里存的值会原样
 *    进 `ItemSearchRequest.sortBy`。分页是后端切片，排序**必须**在后端做，
 *    前端自己排只会让"第几页"对不上。
 */
export type { SortBy };

/** 下拉里的四个选项。`hint` 用在下拉的 title 上，说清次序。 */
export const SORT_CHOICES: { value: SortBy; label: string; hint: string }[] = [
  { value: 'created', label: '入库时间', hint: '最近入库的排在最前（默认）' },
  { value: 'quality', label: '品质', hint: '品质 → 等级 → 名称（传奇在前）' },
  { value: 'level', label: '等级', hint: '等级 → 品质 → 名称（等级需求升序）' },
  { value: 'name', label: '名称', hint: '名称 → 品质 → 等级' },
];

/** 没选过时按入库时间排（使用者 2026-09-13 指定）。 */
export const DEFAULT_SORT: SortBy = 'created';

const STORAGE_KEY = 'iagd.sortBy';

function isSortBy(value: unknown): value is SortBy {
  return value === 'created' || value === 'quality' || value === 'level' || value === 'name';
}

function readSort(): SortBy {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isSortBy(stored) ? stored : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

/** 当前排序 + 改法。偏好存 localStorage，刷新后还在。 */
export function useSort() {
  const [sortBy, setSortByState] = useState<SortBy>(readSort);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, sortBy);
    } catch {
      /* 存不了就算了，只是下次打开回到默认值 */
    }
  }, [sortBy]);

  const setSortBy = useCallback((value: SortBy) => setSortByState(value), []);

  return { sortBy, setSortBy };
}

export type SortState = ReturnType<typeof useSort>;
