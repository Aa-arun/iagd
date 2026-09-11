import type IItem from '../model/item';
import type ICollectionItem from '../model/collection';

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

/** `GET /api/collection` 的响应 */
export type CollectionResponse = Paged<ICollectionItem>;

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
