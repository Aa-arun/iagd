import { useCallback, useEffect, useState } from 'react';
import type { FiltersOptions, ItemSearchRequest, RarityCondition, StatOperator } from '../api';
import type { SortBy } from './useSort';

/**
 * 过滤状态，以及「界面勾选 → 请求体」的翻译。
 *
 * ★ 2026-09-13 起这里有**两套来源独立的条件**（使用者澄清的心智模型）：
 *
 *   ① **搜索条件**（`useSearchConditions`）—— 高级搜索里的那些选项。它相当于
 *      "搜「某某装备 and 穿刺伤害」"：只决定**搜出来什么**，与过滤器无关，
 *      不会改动过滤器的配置。
 *   ② **过滤条件**（`useFilters`）—— 过滤面板那些选项，作用在①的结果之上，
 *      再筛一遍。
 *
 *   两者最终都翻译进**同一个** `ItemSearchRequest`，由 `buildSearchRequest`
 *   合并（组间天然是 AND）。
 *
 * ★ 为什么翻译集中在这里：后端只认一个请求体，集中翻译才能保证"界面上勾了
 * 什么"和"实际发了什么请求"始终对得上。
 *
 * 字段与后端 DTO 一一对应，见 `.docs/03-目标架构.md` §4.5。
 */

/** 一个分组项的逻辑：**与** = 同时满足，**或** = 满足任意一个。 */
export type FilterMode = 'and' | 'or';

/** 槽位里的"所有物品"哨兵：不是某个槽位，而是排除全部装备。 */
export const ALL_ITEMS = '__all_items__';

/**
 * "职业"这个逻辑组的 key。
 *
 * 后端没有"职业组"这个对象（职业是一张扁平清单），但界面上它和物品属性的分组一样
 * 需要"点组名切逻辑"，所以给它一个约定的 key 放进 `groupModes`。
 */
export const CLASS_GROUP = 'classes';

/**
 * 表达"这个条件不可能命中"的哨兵值。
 *
 * ★ 用在两套条件**求交后为空**的时候：搜索侧只想要传奇、过滤侧只想要稀有，
 *   "传奇 AND 稀有"就是空集。后端的集合类字段（品质/槽位/职业）空数组 =
 *   **不加约束**，所以不能用空数组表达"必空"——只好给一个数据库里不存在的值，
 *   让 `IN (...)` 自然匹配不到任何行。
 */
const IMPOSSIBLE = '__none__';

export interface SelectedFilters {
  /** 选中的属性项 id（**二态**：选中 / 未选） */
  items: string[];
  /**
   * 每个**属性组**的逻辑：`and`（与，黄）或 `or`（或，绿）。缺省 = `and`。
   *
   * ★ 逻辑是**组**的属性，不是单个选项的：点组名切换整组，
   * 组里的选项跟着变色。见 `.docs/14-疑难决定.md` §8。
   */
  groupModes: Record<string, FilterMode>;
  /** 品质。key 形如 `Green:2` = 绿色 + 最少 2 个词缀（"双稀有"） */
  rarities: string[];
  /** 槽位 key（可能含 {@link ALL_ITEMS}） */
  slots: string[];
  classes: string[];
}

/** 高级搜索里的一条数值条件。 */
export interface NumericCondition {
  id: number;
  stat: string;
  operator: StatOperator;
  threshold: number;
}

/**
 * 高级搜索：等级区间 + 入库时间 + 数值条件。
 *
 * ⚠️ **排序不在这里**：它是视图偏好，2026-09-13 搬到工具条了（见 `useSort.ts`）。
 */
export interface AdvancedFilters {
  minLevel: number;
  maxLevel: number;
  /** 只看最近 N 小时内入库的物品；0 = 不限 */
  recentHours: number;
  numeric: NumericCondition[];
}

/** 一整套条件。草稿 / 主状态都是这个形状。 */
export interface FilterState {
  selected: SelectedFilters;
  advanced: AdvancedFilters;
}

export const EMPTY_SELECTED: SelectedFilters = { items: [], groupModes: {}, rarities: [], slots: [], classes: [] };
export const EMPTY_ADVANCED: AdvancedFilters = {
  minLevel: 0,
  maxLevel: 0,
  recentHours: 0,
  numeric: [],
};
export const EMPTY_FILTER_STATE: FilterState = { selected: EMPTY_SELECTED, advanced: EMPTY_ADVANCED };

/**
 * 入库时间的档位。值与后端 `recentHours` 对应。
 *
 * ⚠️ 没有"不限"这一档：**不选就是不限**（`recentHours = 0`）。再点一下已选中的就是取消。
 */
export const RECENT_CHOICES = [
  { hours: 5, label: '五小时内' },
  { hours: 24, label: '一天内' },
  { hours: 168, label: '一周内' },
  { hours: 720, label: '一月内' },
] as const;

/** 过滤条件（过滤面板）的存储 key。 */
const FILTER_SELECTED_KEY = 'iagd.filters';
const FILTER_ADVANCED_KEY = 'iagd.advancedSearch';
/**
 * 搜索条件（高级搜索）的存储 key。
 *
 * ★ 与过滤条件**分开存**：它们是两套独立的东西，共用一个 key 会互相覆盖。
 *   ⚠️ 旧的 'iagd.advancedSearch' 里可能还留着老版本写进去的排序/等级等，
 *   那些字段读的时候会被忽略（见 `readAdvanced`），不会污染新结构。
 */
const SEARCH_SELECTED_KEY = 'iagd.search.filters';
const SEARCH_ADVANCED_KEY = 'iagd.search.advanced';

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

function readSelected(key: string): SelectedFilters {
  const stored = readJson(key, EMPTY_SELECTED);
  const groupModes: Record<string, FilterMode> = {};
  for (const [id, mode] of Object.entries(stored.groupModes ?? {})) {
    if (mode === 'and' || mode === 'or') groupModes[id] = mode;
  }
  return {
    items: strings(stored.items),
    groupModes,
    rarities: strings(stored.rarities),
    slots: strings(stored.slots),
    classes: strings(stored.classes),
  };
}

function readAdvanced(key: string): AdvancedFilters {
  const stored = readJson(key, EMPTY_ADVANCED);
  const numeric = Array.isArray(stored.numeric) ? stored.numeric : [];
  return {
    minLevel: typeof stored.minLevel === 'number' ? stored.minLevel : 0,
    maxLevel: typeof stored.maxLevel === 'number' ? stored.maxLevel : 0,
    recentHours: typeof stored.recentHours === 'number' ? stored.recentHours : 0,
    numeric: numeric.filter((n) => n && typeof n.stat === 'string' && typeof n.threshold === 'number'),
  };
}

function readState(selectedKey: string, advancedKey: string): FilterState {
  return { selected: readSelected(selectedKey), advanced: readAdvanced(advancedKey) };
}

/** 列表里加上或去掉一个值。 */
export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** 深拷贝一份条件——高级搜索打开时拿它做草稿，避免改动直接落到主状态上。 */
export function cloneFilterState(state: FilterState): FilterState {
  return {
    selected: {
      items: [...state.selected.items],
      groupModes: { ...state.selected.groupModes },
      rarities: [...state.selected.rarities],
      slots: [...state.selected.slots],
      classes: [...state.selected.classes],
    },
    advanced: {
      minLevel: state.advanced.minLevel,
      maxLevel: state.advanced.maxLevel,
      recentHours: state.advanced.recentHours,
      numeric: state.advanced.numeric.map((n) => ({ ...n })),
    },
  };
}

/** 有没有任何条件（不含关键词——关键词不算在 `selected` / `advanced` 里）。 */
export function hasAnyFilter(selected: SelectedFilters, advanced: AdvancedFilters): boolean {
  return (
    selected.items.length > 0 ||
    selected.rarities.length > 0 ||
    selected.slots.length > 0 ||
    selected.classes.length > 0 ||
    advanced.numeric.length > 0 ||
    advanced.minLevel > 0 ||
    advanced.maxLevel > 0 ||
    advanced.recentHours > 0
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
    (advanced.maxLevel > 0 ? 1 : 0) +
    (advanced.recentHours > 0 ? 1 : 0)
  );
}

/** 装备槽位（护甲 / 武器 / 首饰三组）。"所有物品"靠反选它们来表达。 */
export function equipmentSlots(options: FiltersOptions | null): string[] {
  return (options?.slotGroups ?? [])
    .filter((group) => group.id !== 'item')
    .flatMap((group) => group.items.map((item) => item.value));
}

/** flag 类选项 → 请求体字段。取值来自后端 `FilterCatalog` 里的 `flag`。 */
function applyFlag(req: ItemSearchRequest, flag: string): void {
  switch (flag) {
    case 'socketedOnly': req.socketedOnly = true; break;
    case 'enchantedOnly': req.enchantedOnly = true; break;
    case 'duplicatesOnly': req.duplicatesOnly = true; break;
    case 'hasPetBonus': req.hasPetBonus = true; break;
    case 'petBonuses': req.petBonuses = true; break;
    case 'isRetaliation': req.isRetaliation = true; break;
    case 'withGrantSkillsOnly': req.withGrantSkillsOnly = true; break;
    case 'withSummonerSkillOnly': req.withSummonerSkillOnly = true; break;
    default: break; // 后端将来加了新的 flag 而前端还没更新时，忽略而不是崩掉
  }
}

/** `Green:2` → `{ rarity: 'Green', prefixRarity: 2 }` */
export function toRarityCondition(key: string): RarityCondition {
  const [rarity, prefix] = key.split(':');
  return { rarity, prefixRarity: Number(prefix) || 0 };
}

/**
 * 品质：两侧都限定时取**值**的交集，词缀门槛取更严的那个。
 *
 * ★ 为什么交集就等于 AND：后端的 `rarityConditions` 是**组内或**，而品质值
 *   （Epic / Blue / Green / Yellow）互斥，所以
 *   「(传奇 或 史诗) 且 (史诗 或 稀有)」的结果恰好是「史诗」= 交集。
 *   `prefixRarity` 是同一品质上的门槛（"绿色且 ≥2 词缀"），取更大的那个。
 */
function mergeRarities(searchKeys: string[], filterKeys: string[]): RarityCondition[] | null {
  if (!searchKeys.length && !filterKeys.length) return null;
  if (!searchKeys.length) return filterKeys.map(toRarityCondition);
  if (!filterKeys.length) return searchKeys.map(toRarityCondition);

  const asMap = new Map<string, number>();
  for (const key of searchKeys) {
    const c = toRarityCondition(key);
    asMap.set(c.rarity, Math.max(asMap.get(c.rarity) ?? 0, c.prefixRarity));
  }
  const bsMap = new Map<string, number>();
  for (const key of filterKeys) {
    const c = toRarityCondition(key);
    bsMap.set(c.rarity, Math.max(bsMap.get(c.rarity) ?? 0, c.prefixRarity));
  }

  const merged: RarityCondition[] = [];
  for (const [rarity, prefix] of asMap) {
    const other = bsMap.get(rarity);
    if (other === undefined) continue;
    merged.push({ rarity, prefixRarity: Math.max(prefix, other) });
  }
  return merged.length ? merged : [{ rarity: IMPOSSIBLE, prefixRarity: 0 }];
}

/** 「所有物品」在这个槽位清单里展开成"排除全部装备"。 */
function expandSlots(list: string[], equipment: string[]): { slot: string[]; inverse: boolean } {
  if (list.includes(ALL_ITEMS)) return { slot: equipment, inverse: true };
  return { slot: list, inverse: false };
}

/**
 * 槽位：两侧都限定时取**交集**（槽位互斥，理由同品质）。
 *
 * ⚠️ `ALL_ITEMS` 不是"某个槽位"而是"排除全部装备"，所以：
 *   两侧都是它 → 还是它；一侧是它、另一侧是具体槽位 → **空集**（装备与非装备无交集）。
 */
function mergeSlots(
  options: FiltersOptions | null,
  searchSlots: string[],
  filterSlots: string[],
): { slot: string[]; inverse: boolean } | null {
  if (!searchSlots.length && !filterSlots.length) return null;

  const equipment = equipmentSlots(options);
  const aAll = searchSlots.includes(ALL_ITEMS);
  const bAll = filterSlots.includes(ALL_ITEMS);

  if (!searchSlots.length) return expandSlots(filterSlots, equipment);
  if (!filterSlots.length) return expandSlots(searchSlots, equipment);
  if (aAll && bAll) return { slot: equipment, inverse: true };
  if (aAll || bAll) return { slot: [IMPOSSIBLE], inverse: false };

  const merged = searchSlots.filter((slot) => filterSlots.includes(slot));
  return { slot: merged.length ? merged : [IMPOSSIBLE], inverse: false };
}

function classMode(selected: SelectedFilters): FilterMode {
  return selected.groupModes[CLASS_GROUP] ?? 'and';
}

/**
 * 职业：两侧都限定时合并。
 *
 * - 两侧都是"或" → 取**交集**（职业值互斥，理由同品质）。
 * - 只要有一侧是"与" → 取**并集**并按"与"处理。
 *
 * ⚠️ 第二种是**近似**：后端只有一个 `classes` 字段，"（A 且 B）且（C 或 D）"
 * 表达不了。取并集 + "与"只会更严（宁少不错），不会把不该出现的放进来。
 * 两侧都用职业筛选本来就少见，不值得为它加一组后端字段。
 */
function mergeClasses(
  search: SelectedFilters,
  filter: SelectedFilters,
): { classes: string[]; any: boolean } | null {
  const a = search.classes;
  const b = filter.classes;
  if (!a.length && !b.length) return null;
  if (!a.length) return { classes: b, any: classMode(filter) === 'or' };
  if (!b.length) return { classes: a, any: classMode(search) === 'or' };

  if (classMode(search) === 'or' && classMode(filter) === 'or') {
    const merged = a.filter((value) => b.includes(value));
    return { classes: merged.length ? merged : [IMPOSSIBLE], any: true };
  }

  return { classes: Array.from(new Set([...a, ...b])), any: false };
}

/** 把一套条件里的属性项按**所在组**的逻辑收集成 `filters` 的"与组 / 或组"。 */
function statGroups(
  options: FiltersOptions | null,
  selected: SelectedFilters,
): { andGroups: string[][]; orGroups: string[][]; flags: string[] } {
  const andGroups: string[][] = [];
  const orFields: string[] = [];
  const flags: string[] = [];

  for (const group of options?.groups ?? []) {
    // ★ 逻辑是**整组**的属性：组名点一下就整组换（见 14-疑难决定 §8）
    const mode = selected.groupModes[group.id] ?? 'and';

    for (const item of group.items) {
      if (!selected.items.includes(item.id)) continue;

      if (item.kind === 'flag' && item.flag) {
        // 开关类没有"或"可言（各自是独立布尔），固定按"与"处理
        flags.push(item.flag);
        continue;
      }

      if (!item.fields.length) continue;
      if (mode === 'and') andGroups.push(item.fields);
      else orFields.push(...item.fields);
    }
  }

  return { andGroups, orGroups: orFields.length ? [orFields] : [], flags };
}

/** 一次查询的三个来源。 */
export interface QuerySources {
  /** 搜索框里的关键词（属于"搜索"） */
  keyword: string;
  /** 高级搜索的条件：只决定搜出来什么 */
  search: FilterState;
  /** 过滤面板的条件：在搜索结果之上再筛一遍 */
  filter: FilterState;
}

/**
 * 把「搜索条件 + 关键词 + 过滤条件」拼成后端请求。
 *
 * ★ 合并的总原则：**两类条件之间是 AND**。大部分字段天然满足：
 *   - 属性存在性 / 数值条件 / 开关类：各自成条，后端本来就是组间 AND
 *   - 等级区间：求交（0 = 不限）
 *   - 入库时间：取更严格的那个
 *   - 品质 / 槽位 / 职业：这几个是"集合 + 互斥值"，交集恰好等于 AND
 *     （细节见各自的 merge 函数说明）
 *
 * ★ `sortBy` 与过滤无关，但同样必须进请求体：分页切片在**后端**做，
 *   排序只能由后端拼进 SQL（见 `PlayerItemDaoImpl.BuildOrderBy`）。
 */
export function buildSearchRequest(
  options: FiltersOptions | null,
  sources: QuerySources,
  sortBy: SortBy,
  offset: number,
  limit: number,
): ItemSearchRequest {
  const req: ItemSearchRequest = { offset, limit, sortBy };

  const word = sources.keyword.trim();
  if (word) req.wildcard = word;

  const rarities = mergeRarities(sources.search.selected.rarities, sources.filter.selected.rarities);
  if (rarities) req.rarityConditions = rarities;

  const slots = mergeSlots(options, sources.search.selected.slots, sources.filter.selected.slots);
  if (slots) {
    req.slot = slots.slot;
    if (slots.inverse) req.slotInverse = true;
  }

  const classes = mergeClasses(sources.search.selected, sources.filter.selected);
  if (classes) {
    req.classes = classes.classes;
    if (classes.any) req.classesAny = true;
  }

  const mins = [sources.search.advanced.minLevel, sources.filter.advanced.minLevel].filter((v) => v > 0);
  const maxes = [sources.search.advanced.maxLevel, sources.filter.advanced.maxLevel].filter((v) => v > 0);
  if (mins.length) req.minimumLevel = Math.max(...mins);
  if (maxes.length) req.maximumLevel = Math.min(...maxes);

  const recents = [sources.search.advanced.recentHours, sources.filter.advanced.recentHours].filter((v) => v > 0);
  if (recents.length) req.recentHours = Math.min(...recents);

  const numeric = [...sources.search.advanced.numeric, ...sources.filter.advanced.numeric];
  if (numeric.length) {
    req.statValueFilters = numeric.map((n) => ({
      fields: [n.stat],
      operator: n.operator,
      threshold: n.threshold,
    }));
  }

  const searchGroups = statGroups(options, sources.search.selected);
  const filterGroups = statGroups(options, sources.filter.selected);
  for (const flag of [...searchGroups.flags, ...filterGroups.flags]) applyFlag(req, flag);

  const groups = [
    ...searchGroups.andGroups,
    ...filterGroups.andGroups,
    ...searchGroups.orGroups,
    ...filterGroups.orGroups,
  ];
  if (groups.length) req.filters = groups;

  return req;
}

// `void pickStricter;` 已移除——合并逻辑各自写在上面几个 merge 函数里。

/**
 * 一套条件 + 一组语义化的改法（**不落盘**）。
 *
 * ★ 它被用三次：过滤条件主状态、搜索条件主状态、以及高级搜索打开时的**草稿**。
 *   三处共用同一份实现，才能保证语义完全一致。
 */
export function useFilterState(initial: FilterState) {
  const [selected, setSelected] = useState<SelectedFilters>(initial.selected);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(initial.advanced);

  /** 选中 / 取消一个属性项（二态） */
  const toggleItem = useCallback((id: string) => {
    setSelected((s) => ({ ...s, items: toggleIn(s.items, id) }));
  }, []);

  /** 切换**整组**的逻辑：与（黄）↔ 或（绿） */
  const cycleGroupMode = useCallback((groupId: string) => {
    setSelected((s) => {
      const current = s.groupModes[groupId] ?? 'and';
      return { ...s, groupModes: { ...s.groupModes, [groupId]: current === 'and' ? 'or' : 'and' } };
    });
  }, []);

  /** 整组一起选 / 一起取消（槽位那四组用） */
  const setItems = useCallback((ids: string[], on: boolean) => {
    setSelected((s) => {
      const kept = s.items.filter((id) => !ids.includes(id));
      return { ...s, items: on ? [...kept, ...ids] : kept };
    });
  }, []);

  /** 品质。选中即"或"——多条品质是"这个或那个"的关系 */
  const toggleRarity = useCallback((key: string) => {
    setSelected((s) => ({ ...s, rarities: toggleIn(s.rarities, key) }));
  }, []);

  /** 槽位。同样是"或"。⚠️ "所有物品"与逐项选择互斥 */
  const toggleSlot = useCallback((value: string) => {
    setSelected((s) => {
      if (value === ALL_ITEMS) {
        return { ...s, slots: s.slots.includes(ALL_ITEMS) ? [] : [ALL_ITEMS] };
      }
      const slots = s.slots.filter((slot) => slot !== ALL_ITEMS);
      return { ...s, slots: toggleIn(slots, value) };
    });
  }, []);

  /** 整组槽位一起选 / 一起取消 */
  const setSlots = useCallback((values: string[], on: boolean) => {
    setSelected((s) => {
      const slots = s.slots.filter((slot) => slot !== ALL_ITEMS);
      const merged = on
        ? [...slots, ...values.filter((v) => !slots.includes(v))]
        : slots.filter((slot) => !values.includes(slot));
      return { ...s, slots: merged };
    });
  }, []);

  const toggleClass = useCallback((value: string) => {
    setSelected((s) => ({ ...s, classes: toggleIn(s.classes, value) }));
  }, []);

  const setLevels = useCallback((minLevel: number, maxLevel: number) => {
    setAdvanced((a) => ({ ...a, minLevel, maxLevel }));
  }, []);

  const setRecentHours = useCallback((recentHours: number) => {
    setAdvanced((a) => ({ ...a, recentHours }));
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

  /** 清空这套条件（过滤条件里就是"清除过滤"，草稿里就是"重置全部"） */
  const clear = useCallback(() => {
    setSelected(EMPTY_SELECTED);
    setAdvanced(EMPTY_ADVANCED);
  }, []);

  /** 整体替换（高级搜索"完成"时把草稿一次写回搜索条件） */
  const replace = useCallback((next: FilterState) => {
    setSelected(next.selected);
    setAdvanced(next.advanced);
  }, []);

  return {
    selected,
    advanced,
    toggleItem,
    cycleGroupMode,
    setItems,
    toggleRarity,
    toggleSlot,
    setSlots,
    toggleClass,
    setLevels,
    setRecentHours,
    addNumeric,
    updateNumeric,
    removeNumeric,
    clear,
    replace,
  };
}

/** {@link useFilterState} 的返回值（含 selected / advanced 与全部操作）。 */
export type FilterApi = ReturnType<typeof useFilterState>;

/** 过滤条件（过滤面板）：主状态，存 localStorage。 */
export function useFilters(): FilterApi {
  const [initial] = useState(() => readState(FILTER_SELECTED_KEY, FILTER_ADVANCED_KEY));
  const state = useFilterState(initial);

  useEffect(() => {
    localStorage.setItem(FILTER_SELECTED_KEY, JSON.stringify(state.selected));
  }, [state.selected]);

  useEffect(() => {
    localStorage.setItem(FILTER_ADVANCED_KEY, JSON.stringify(state.advanced));
  }, [state.advanced]);

  return state;
}

/**
 * 搜索条件（高级搜索里的那些选项）：主状态，存 localStorage。
 *
 * ★ 与 {@link useFilters} 完全同构、但**两套 key、两份状态**：高级搜索不再
 *   "共用过滤器的状态"，它只筛选搜出来的结果（使用者 2026-09-13 澄清）。
 */
export function useSearchConditions(): FilterApi {
  const [initial] = useState(() => readState(SEARCH_SELECTED_KEY, SEARCH_ADVANCED_KEY));
  const state = useFilterState(initial);

  useEffect(() => {
    localStorage.setItem(SEARCH_SELECTED_KEY, JSON.stringify(state.selected));
  }, [state.selected]);

  useEffect(() => {
    localStorage.setItem(SEARCH_ADVANCED_KEY, JSON.stringify(state.advanced));
  }, [state.advanced]);

  return state;
}

/** `useFilters()` 的返回值。`AppShell` 只透传，不关心实现。 */
export type FilterControls = FilterApi;
