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

/** `GET /api/filters/options` 的响应 */
export interface FiltersOptions {
  /** 槽位，如 `ArmorProtective_Head` */
  classes: string[];
  /** 品质，如 `Legendary` / `Epic` */
  qualities: string[];
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
 * ★ 字段对齐 C# 的 `IAGrim/Database/Dto/ItemSearchRequest.cs`——
 * 保持同名同义，将来换成 C# 后端时前端不用改。
 * 完整结构定义见 [`.docs/03-目标架构.md`](../../../.docs/03-目标架构.md) §4.4。
 *
 * ⚠️ 标 `未实现` 的字段结构已定，但 `tools/devapi` 目前不接受它们
 * （传了不报错、也不生效），见 [`04-开发环境.md`](../../../.docs/04-开发环境.md) §8.5。
 */
export interface ItemSearchRequest {
  /** 关键词。**空格会被当作多个关键词**："神话 面具" 匹配 "神话 … 面具" */
  wildcard?: string;
  minimumLevel?: number;
  maximumLevel?: number;
  /** 品质，如 `Legendary` / `Epic` */
  rarity?: string | null;
  /** 槽位（未实现） */
  slot?: string[] | null;
  slotInverse?: boolean;
  /** 查普通仓库还是硬核仓库——二选一，不是"可选过滤" */
  isHardcore?: boolean;
  socketedOnly?: boolean;
  /** 职业（未实现） */
  classes?: string[];
  /** 只看重复物品（未实现） */
  duplicatesOnly?: boolean;
  hasPetBonus?: boolean;
  /** 只看可镶嵌（未实现） */
  statValueFilters?: unknown[];

  // 分页
  offset?: number;
  limit?: number;
  /** 是否附带属性翻译（devapi 的扩展参数，默认 true） */
  stats?: boolean;
}
