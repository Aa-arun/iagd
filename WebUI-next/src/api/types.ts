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
