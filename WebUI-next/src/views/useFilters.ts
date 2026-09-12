import { useCallback, useEffect, useState } from 'react';
import type { FiltersOptions, ItemSearchRequest, RarityCondition, StatOperator } from '../api';

/**
 * 过滤状态，以及「界面勾选 → 请求体」的翻译。
 *
 * ★ 为什么集中放这里：筛选条件散在过滤面板与高级搜索两处，而后端只认一个
 * `ItemSearchRequest`。集中翻译才能保证"界面上勾了什么"和"实际发了什么请求"
 * 始终对得上——这也是"一键清除"能可靠实现的前提。
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

/** 高级搜索：等级区间 + 入库时间 + 排序 + 数值条件。 */
export interface AdvancedFilters {
  minLevel: number;
  maxLevel: number;
  /** 只看最近 N 小时内入库的物品；0 = 不限 */
  recentHours: number;
  orderByLevel: boolean;
  numeric: NumericCondition[];
}

export const EMPTY_SELECTED: SelectedFilters = { items: [], groupModes: {}, rarities: [], slots: [], classes: [] };
export const EMPTY_ADVANCED: AdvancedFilters = {
  minLevel: 0,
  maxLevel: 0,
  recentHours: 0,
  orderByLevel: false,
  numeric: [],
};

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

function readAdvanced(): AdvancedFilters {
  const stored = readJson(ADVANCED_KEY, EMPTY_ADVANCED);
  const numeric = Array.isArray(stored.numeric) ? stored.numeric : [];
  return {
    minLevel: typeof stored.minLevel === 'number' ? stored.minLevel : 0,
    maxLevel: typeof stored.maxLevel === 'number' ? stored.maxLevel : 0,
    recentHours: typeof stored.recentHours === 'number' ? stored.recentHours : 0,
    orderByLevel: stored.orderByLevel === true,
    numeric: numeric.filter((n) => n && typeof n.stat === 'string' && typeof n.threshold === 'number'),
  };
}

/** 列表里加上或去掉一个值。 */
export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** 有没有任何过滤条件。 */
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

/**
 * 把界面状态拼成后端请求。
 *
 * ★ 分组项的逻辑怎么落到请求里：后端的 `filters` 是"**组间与、组内或**"。
 * 所以标了"与"的项各自独立成组，标了"或"的项合并成**同一组**：
 *
 *   火焰(与) + 冰冷(与)         → [[fire], [cold]]        火焰 **且** 冰冷
 *   火焰(或) + 冰冷(或)         → [[fire, cold]]           火焰 **或** 冰冷
 *   火焰(与) + 冰冷(或) + 酸(或) → [[fire], [cold, acid]]   火焰 **且**（冰冷 或 酸）
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

  if (selected.rarities.length) {
    req.rarityConditions = selected.rarities.map(toRarityCondition);
  }

  const allItems = selected.slots.includes(ALL_ITEMS);
  const slots = selected.slots.filter((slot) => slot !== ALL_ITEMS);
  if (allItems) {
    // "所有物品"= 排除全部装备槽位（兜住分类的遗漏）
    req.slot = equipmentSlots(options);
    req.slotInverse = true;
  } else if (slots.length) {
    req.slot = slots;
  }

  if (selected.classes.length) {
    req.classes = selected.classes;
    // 职业的逻辑同样挂在组上（见 chips.tsx 的 ClassRow）
    if ((selected.groupModes[CLASS_GROUP] ?? 'and') === 'or') req.classesAny = true;
  }
  if (advanced.minLevel > 0) req.minimumLevel = advanced.minLevel;
  if (advanced.maxLevel > 0) req.maximumLevel = advanced.maxLevel;
  if (advanced.recentHours > 0) req.recentHours = advanced.recentHours;
  if (advanced.orderByLevel) req.orderByLevel = true;
  if (advanced.numeric.length) {
    req.statValueFilters = advanced.numeric.map((n) => ({
      fields: [n.stat],
      operator: n.operator,
      threshold: n.threshold,
    }));
  }

  const andGroups: string[][] = [];
  const orFields: string[] = [];

  for (const group of options?.groups ?? []) {
    // ★ 逻辑是**整组**的属性：组名点一下就整组换（见 14-疑难决定 §8）
    const mode = selected.groupModes[group.id] ?? 'and';

    for (const item of group.items) {
      if (!selected.items.includes(item.id)) continue;

      if (item.kind === 'flag' && item.flag) {
        // 开关类没有"或"可言（各自是独立布尔），固定按"与"处理
        applyFlag(req, item.flag);
        continue;
      }

      if (!item.fields.length) continue;
      if (mode === 'and') andGroups.push(item.fields);
      else orFields.push(...item.fields);
    }
  }

  const filters = orFields.length ? [...andGroups, orFields] : andGroups;
  if (filters.length) req.filters = filters;

  return req;
}

/** `Green:2` → `{ rarity: 'Green', prefixRarity: 2 }` */
export function toRarityCondition(key: string): RarityCondition {
  const [rarity, prefix] = key.split(':');
  return { rarity, prefixRarity: Number(prefix) || 0 };
}

/** 过滤状态 + 一组语义化的改法。偏好存 localStorage，刷新后条件还在。 */
export function useFilters() {
  const [selected, setSelected] = useState<SelectedFilters>(readSelected);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(readAdvanced);

  useEffect(() => {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(selected));
  }, [selected]);

  useEffect(() => {
    localStorage.setItem(ADVANCED_KEY, JSON.stringify(advanced));
  }, [advanced]);

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
    cycleGroupMode,
    setItems,
    toggleRarity,
    toggleSlot,
    setSlots,
    toggleClass,
    setLevels,
    setRecentHours,
    setOrderByLevel,
    addNumeric,
    updateNumeric,
    removeNumeric,
    clear,
  };
}

/** `useFilters()` 的返回值。`AppShell` 只透传，不关心实现。 */
export type FilterControls = ReturnType<typeof useFilters>;
