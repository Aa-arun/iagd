import type IItem from '../model/item';

/**
 * 分页响应的统一形状。
 *
 * 泛型 `Paged<T>` 表示"里面装的是 T 的分页结果"——
 * 这样列表接口不用为每种数据类型各写一遍 `total`/`offset`/`limit`。
 */
export interface Paged<T> {
  total: number;
  offset: number;
  limit: number;
  items: T[];
}

/** `GET /api/items` 的响应 */
export type ItemsResponse = Paged<IItem>;

/**
 * `GET /api/filters/options` 的响应 —— 过滤器面板（C2）的全部可选项。
 *
 * ★ 这里**只描述形状**：面板本身还没做（见 `.docs/00-当前状态.md` 的下一步）。
 * 后端已经就绪并实测通过（2026-09-12）。
 *
 * 设计要点：**"勾了什么对应哪些 stat 字段"由后端说了算**（`FilterCatalog` 照搬旧
 * WinForms 面板的定义），前端只负责渲染与把勾选翻译成 `ItemSearchRequest`——
 * 否则两份映射迟早漂移，而"勾了火焰抗性却按别的字段过滤"这种错很难发现。
 */
export interface FiltersOptions {
  /** 品质。⚠️ `value` 不是枚举名而是**数据库里的值**：Yellow/Green/Blue/Epic */
  qualities: (LabeledOption & { prefixRarity: number })[];
  /** 槽位（头盔、单手剑…）。清单写死在 C# 的 `SlotTranslator` 里 */
  slots: LabeledOption[];
  /** 职业（class01=士兵…）。已滤掉游戏数据里没有名字的占位项 */
  classes: LabeledOption[];
  /** 数值比较符，`value` 直接对应 C# 的 `StatValueFilter.Op` 枚举名 */
  operators: { value: StatOperator; label: string }[];
  /** 分组复选框：伤害 / 持续伤害 / 抗性 / 杂项 */
  groups: FilterGroup[];
  /**
   * "任意属性 + 数值"下拉的选项。
   * 只列**已被后台预计算**、因而数值过滤真的能生效的属性。
   */
  stats: { name: string; template: string; label: string }[];
}

/** `value` + 已按当前语言翻好的 `label`。 */
export interface LabeledOption {
  value: string;
  label: string;
}

/** 带 i18n tag 的选项：`label` 是后端已翻好的，`labelTag` 可配合 `/api/i18n` 复查。 */
export interface OptionItem extends LabeledOption {
  labelTag?: string;
}

/** 数值过滤的比较符。对应 C# `StatValueFilter.Op`。 */
export type StatOperator =
  | 'GreaterOrEqual'
  | 'GreaterThan'
  | 'LessOrEqual'
  | 'LessThan'
  | 'Equal';

/** 一个过滤器分区（如"抗性"）。 */
export interface FilterGroup {
  id: string;
  label: string;
  labelTag: string;
  items: FilterItem[];
}

/**
 * 分区里的一个可勾选项。
 *
 * - `kind === 'stat'`：勾选 → 塞进 `ItemSearchRequest.filters`（存在性）；
 *   若同时填了数值 → 再塞进 `statValueFilters`（`fields` 的值**求和**后比较）。
 * - `kind === 'flag'`：直接对应 `ItemSearchRequest` 上的一个布尔字段（`flag` 里是字段名）。
 */
export interface FilterItem {
  id: string;
  label: string;
  labelTag: string;
  kind: 'stat' | 'flag';
  fields: string[];
  /** 是否支持"≥ / ≤ 数值"（对应旧面板的 SupportsNumericFilter） */
  numeric: boolean;
  /** `kind === 'flag'` 时才有的布尔字段名，如 `socketedOnly` */
  flag?: string;
}

/** `GET /api/i18n` 的响应：tag → 中文 */
export type I18nMap = Record<string, string>;

/**
 * `POST /api/items/transfer` 的响应。
 * 对应原 `TransferItem()` 返回的 `{success, numTransferred}`。
 */
export interface TransferResult {
  success: boolean;
  /** 实际转移的物品数（堆叠按整叠计） */
  numTransferred: number;
  /** devapi 扩展：被删除的 PlayerItem 记录数 */
  deleted?: number;
}

/**
 * 设置（用户可改的那些）。
 *
 * ★ 这是**刻意收窄**过的子集——2026-09-12 与使用者逐项确认。
 * 暗色模式、最小化到托盘、自动更新、多电脑共用、在线备份、语言选择都**不在**这里：
 *   - 前几个在新架构下没有意义（界面在浏览器里）
 *   - 多电脑/在线备份依赖原作者的服务器，将来要做自建云备份
 *   - 语言暂锁中文
 * 见 [`.docs/00-当前状态.md`](../../../.docs/00-当前状态.md) 的待办。
 */
export interface AppSettings {
  /** 隐藏物品上的技能说明 */
  hideSkills: boolean;
  /** 允许把物品转移到任意 Mod 的仓库（而不限于当前 Mod） */
  transferAnyMod: boolean;
  /** 搜索延迟（输入后稍等再查） */
  preferDelayedSearch: boolean;
  /** 备份压缩成 zip */
  backupCustom: boolean;
  /** 备份目录（`backupCustom` 为 true 时使用） */
  backupCustomLocation: string;
  /**
   * 物品转移到哪个公共仓库。
   * `0` = 倒数第二个；`1..6` = 公共仓库 N。
   */
  stashToDepositTo: number;
  /**
   * 从哪个公共仓库取出物品。
   * `0` = 最后一个；`1..6` = 公共仓库 N。
   */
  stashToLootFrom: number;
}

/** 设置的增量更新：只提交被改动的项 */
export type SettingsUpdate = Partial<AppSettings>;

/**
 * 搜索请求。
 *
 * ★ 字段对齐 C# 的 `IAGrim/Database/Dto/ItemSearchRequest.cs`，同名同义。
 * 完整结构定义见 [`.docs/03-目标架构.md`](../../../.docs/03-目标架构.md) §4.5。
 *
 * ★ 这些字段**全部由真实 C# 后端支持**（2026-09-12 起；旧 `tools/devapi` 那句
 * "传了不生效"已经作废——devapi 已退役）。哪些组合真的能过滤，看
 * `FiltersOptions.groups` 里的 `kind` / `fields` / `numeric`。
 */
export interface ItemSearchRequest {
  /**
   * 关键词。**空格会被当作多个关键词**："神话 面具" 匹配 "神话 … 面具"。
   *
   * ★ 它还会**按属性名匹配**：搜"火焰抗性"会找出带该属性的物品，
   * 而不只是名字里含这几个字的。解析在后端完成（`FilterCatalog.ResolveKeyword`）。
   */
  wildcard?: string;
  minimumLevel?: number;
  maximumLevel?: number;
  /** 品质**单值**。⚠️ 用数据库里的值 `Yellow` / `Green` / `Blue` / `Epic`，不是 `Legendary` */
  rarity?: string | null;
  /**
   * 品质**多选**（过滤器面板的稀有度是 checklist）。
   * ★ 非空时**优先于** `rarity`。可选项见 `FiltersOptions.qualities`。
   */
  rarities?: string[];
  /** 绿色物品的词缀数量门槛（配合 `rarity: 'Green'`） */
  prefixRarity?: number;
  /**
   * 排序：`true` = 按等级需求升序（旧界面的「按等级排序」），缺省 = 按物品名。
   * ⚠️ 只是排序、不是过滤条件；分页期间别改它，否则切片会对不上。
   */
  orderByLevel?: boolean;
  /** 槽位（`ArmorProtective_Head` …） */
  slot?: string[] | null;
  /** true = **排除** `slot` 里的槽位 */
  slotInverse?: boolean;
  /**
   * 仓库前提，**不是**可选过滤：空 = 只看非 Mod 物品。
   * ⏸ 目前前端**没有**选择器（2026-09-12 决定暂不做）→ 见 `.docs/13-后端待办与计划.md` §3。
   */
  mod?: string | null;
  /** 查普通仓库还是硬核仓库——二选一，不是"可选过滤" */
  isHardcore?: boolean;
  socketedOnly?: boolean;
  /** 职业（`class01` …）。来自 `FiltersOptions.classes` */
  classes?: string[];
  /** 只看重复物品 */
  duplicatesOnly?: boolean;
  hasPetBonus?: boolean;
  /** 把其它属性过滤限制在**战宠**记录上（"战宠的攻击速度"） */
  petBonuses?: boolean;
  /** 只看反击类物品（对应过滤面板"伤害"组里的"反击"） */
  isRetaliation?: boolean;
  /** 只看到手 12 小时以内的物品 */
  recentOnly?: boolean;
  /** 只看能授予技能、可放上技能栏触发的物品 */
  withGrantSkillsOnly?: boolean;
  /** 只看能授予召唤技能的物品 */
  withSummonerSkillOnly?: boolean;
  /** 存在性过滤：每个元素是一组 stat 字段，**命中组内任意一个**即可（组间是 AND） */
  filters?: string[][];
  /** 数值过滤：`fields` 的值求和后与 `threshold` 比较 */
  statValueFilters?: StatValueFilter[];

  // 分页
  offset?: number;
  limit?: number;
}

/** 一条数值过滤条件（对应 C# 的 `StatValueFilter`）。 */
export interface StatValueFilter {
  /** stat 字段名；它们的计算值会被**求和**后再比较 */
  fields: string[];
  operator: StatOperator;
  threshold: number;
}
