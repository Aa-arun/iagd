import { useCallback, useEffect, useState } from 'react';
import type { FiltersOptions, ItemSearchRequest, StatOperator } from '../api';

/**
 * 过滤状态，以及「界面勾选 → 请求体」的翻译。
 *
 * ★ 为什么集中放这里：筛选条件散在三个地方（过滤面板的分组、品质/槽位/职业多选、
 * 高级搜索的数值与等级），而后端只认一个 `ItemSearchRequest`。集中翻译才能保证
 * "界面上勾了什么"和"实际发了什么请求"始终对得上——这也是"一键清除"能可靠实现的前提。
 *
 * 字段与后端 DTO 一一对应，见 `.docs/03-目标架构.md` §4.5。
 */

/** 过滤面板里选中的东西（都是字符串 id，直接来自 `GET /api/filters/options`）。 */
export interface SelectedFilters {
  /** 分组复选框选中的 `FilterItem.id`（stat 类与 flag 类混在一起，翻译时再分开） */
  items: string[];
  /** 品质值，如 `Epic` —— 对应请求体的 `rarities` */
  rarities: string[];
  /** 槽位值，如 `ArmorProtective_Head` */
  slots: string[];
  /** 职业值，如 `class08` */
  classes: string[];
}

/** 高级搜索里的一条数值条件。 */
export interface NumericCondition {
  id: number;
  /** stat 字段名，来自 options 的 `stats` */
  stat: string;
  operator: StatOperator;
  threshold: number;
}

/** 高级搜索：等级区间 + 排序 + 数值条件。 */
export interface AdvancedFilters {
  minLevel: number;
  maxLevel: number;
  orderByLevel: boolean;
  numeric: NumericCondition[];
}

export const EMPTY_SELECTED: SelectedFilters = { items: [], rarities: [], slots: [], classes: [] };
export const EMPTY_ADVANCED: AdvancedFilters = { minLevel: 0, maxLevel: 0, orderByLevel: false, numeric: [] };

const SELECTED_KEY = 'iagd.filters';
const ADVANCED_KEY = 'iagd.advancedSearch';

/** 存进 localStorage 的值可能被手改坏，或者来自旧版本 —— 读回来一律重新校验。 */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function readJson<T extends object>(key: string, fallback: T): Partial<T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : fallback;
  } catch {
    return fallback;
  }
}

function readSelected(): SelectedFilters {
  const stored = readJson(SELECTED_KEY, EMPTY_SELECTED);
  return {
    items: strings(stored.items),
    rarities: strings(stored.rarities),
    slots: strings(stored.slots),
    classes: strings(stored.classes),
  };
}

function readAdvanced(): AdvancedFilters {
  const stored = readJson(ADVANCED_KEY, EMPTY_ADVANCED);
  const numeric = Array.isArray(stored.numeric) ? stored.numeric : [];
  return {
    minLevel: typeof stored.minLevel === 'number' ? stored.minLevel : 0,
    maxLevel: typeof stored.maxLevel === 'number' ? stored.maxLevel : 0,
    orderByLevel: stored.orderByLevel === true,
    numeric: numeric.filter((n) => n && typeof n.stat === 'string' && typeof n.threshold === 'number'),
  };
}

/** 列表里加上或去掉一个值（勾选语义）。 */
export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** 有没有任何过滤条件。决定要不要走 `/api/search`、以及"清除"是否可用。 */
export function hasAnyFilter(selected: SelectedFilters, advanced: AdvancedFilters): boolean {
  return (
    selected.items.length > 0 ||
    selected.rarities.length > 0 ||
    selected.slots.length > 0 ||
    selected.classes.length > 0 ||
    advanced.numeric.length > 0 ||
    advanced.minLevel > 0 ||
    advanced.maxLevel > 0
  );
}

/** 折叠头上那个"已选 N 项"。排序不算条件，所以不计数。 */
export function countFilters(selected: SelectedFilters, advanced: AdvancedFilters): number {
  return (
    selected.items.length +
    selected.rarities.length +
    selected.slots.length +
    selected.classes.length +
    advanced.numeric.length +
    (advanced.minLevel > 0 ? 1 : 0) +
    (advanced.maxLevel > 0 ? 1 : 0)
  );
}

/** flag 类选项 → 请求体字段。取值来自后端 `FilterCatalog` 里的 `flag`。 */
function applyFlag(req: ItemSearchRequest, flag: string): void {
  switch (flag) {
    case 'socketedOnly': req.socketedOnly = true; break;
    case 'duplicatesOnly': req.duplicatesOnly = true; break;
    case 'hasPetBonus': req.hasPetBonus = true; break;
    case 'petBonuses': req.petBonuses = true; break;
    case 'isRetaliation': req.isRetaliation = true; break;
    case 'recentOnly': req.recentOnly = true; break;
    case 'withGrantSkillsOnly': req.withGrantSkillsOnly = true; break;
    case 'withSummonerSkillOnly': req.withSummonerSkillOnly = true; break;
    default: break; // 后端将来加了新的 flag 而前端还没更新时，忽略而不是崩掉
  }
}

/**
 * 把界面状态拼成后端请求。
 *
 * 请求体里**只放真正用到的字段**：后端对 `minimumLevel = 0` / `maximumLevel = 0` 这类
 * 缺省值本来就有"不过滤"的语义，但显式带上会让请求体难以阅读，也让"到底过滤了什么"看不出来。
 */
export function buildSearchRequest(
  options: FiltersOptions | null,
  selected: SelectedFilters,
  advanced: AdvancedFilters,
  keyword: string,
  offset: number,
  limit: number,
): ItemSearchRequest {
  const req: ItemSearchRequest = { offset, limit };

  const word = keyword.trim();
  if (word) req.wildcard = word;
  if (selected.rarities.length) req.rarities = selected.rarities;
  if (selected.slots.length) req.slot = selected.slots;
  if (selected.classes.length) req.classes = selected.classes;
  if (advanced.minLevel > 0) req.minimumLevel = advanced.minLevel;
  if (advanced.maxLevel > 0) req.maximumLevel = advanced.maxLevel;
  if (advanced.orderByLevel) req.orderByLevel = true;
  if (advanced.numeric.length) {
    req.statValueFilters = advanced.numeric.map((n) => ({
      fields: [n.stat],
      operator: n.operator,
      threshold: n.threshold,
    }));
  }

  const chosen = new Set(selected.items);
  const statGroups: string[][] = [];

  for (const group of options?.groups ?? []) {
    for (const item of group.items) {
      if (!chosen.has(item.id)) continue;

      if (item.kind === 'flag' && item.flag) {
        applyFlag(req, item.flag);
      } else if (item.fields.length) {
        statGroups.push(item.fields);
      }
    }
  }

  if (statGroups.length) req.filters = statGroups;

  return req;
}

/**
 * 过滤状态 + 一组语义化的改法。
 *
 * 偏好存 localStorage（与 `usePaging` / `useItemView` 同一套路）：刷新页面后
 * 过滤条件还在，不然每次刷新都要重新勾一遍。
 */
export function useFilters() {
  const [selected, setSelected] = useState<SelectedFilters>(readSelected);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(readAdvanced);

  useEffect(() => {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(selected));
  }, [selected]);

  useEffect(() => {
    localStorage.setItem(ADVANCED_KEY, JSON.stringify(advanced));
  }, [advanced]);

  const toggleItem = useCallback((id: string) => {
    setSelected((s) => ({ ...s, items: toggleIn(s.items, id) }));
  }, []);

  const toggleRarity = useCallback((value: string) => {
    setSelected((s) => ({ ...s, rarities: toggleIn(s.rarities, value) }));
  }, []);

  const toggleSlot = useCallback((value: string) => {
    setSelected((s) => ({ ...s, slots: toggleIn(s.slots, value) }));
  }, []);

  const toggleClass = useCallback((value: string) => {
    setSelected((s) => ({ ...s, classes: toggleIn(s.classes, value) }));
  }, []);

  const setLevels = useCallback((minLevel: number, maxLevel: number) => {
    setAdvanced((a) => ({ ...a, minLevel, maxLevel }));
  }, []);

  const setOrderByLevel = useCallback((orderByLevel: boolean) => {
    setAdvanced((a) => ({ ...a, orderByLevel }));
  }, []);

  const addNumeric = useCallback((stat: string, operator: StatOperator, threshold: number) => {
    setAdvanced((a) => ({
      ...a,
      numeric: [...a.numeric, { id: (a.numeric.at(-1)?.id ?? 0) + 1, stat, operator, threshold }],
    }));
  }, []);

  const updateNumeric = useCallback((id: number, patch: Partial<Omit<NumericCondition, 'id'>>) => {
    setAdvanced((a) => ({
      ...a,
      numeric: a.numeric.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }, []);

  const removeNumeric = useCallback((id: number) => {
    setAdvanced((a) => ({ ...a, numeric: a.numeric.filter((n) => n.id !== id) }));
  }, []);

  const clear = useCallback(() => {
    setSelected(EMPTY_SELECTED);
    setAdvanced(EMPTY_ADVANCED);
  }, []);

  return {
    selected,
    advanced,
    toggleItem,
    toggleRarity,
    toggleSlot,
    toggleClass,
    setLevels,
    setOrderByLevel,
    addNumeric,
    updateNumeric,
    removeNumeric,
    clear,
  };
}

/** `useFilters()` 的返回值。`AppShell` 只透传，不关心实现。 */
export type FilterControls = ReturnType<typeof useFilters>;
