import type {
  CollectionResponse,
  FiltersOptions,
  I18nMap,
  ItemsResponse,
} from './types';

/**
 * REST 客户端。
 *
 * 路径写成相对形式（`/api/...`），由 Vite dev server 代理到后端
 * （见 vite.config.ts）。这样开发时是同源请求，不需要 CORS；
 * 将来换成真正的 C# 后端，只改代理的 target，这里一行都不用动。
 */

/** 请求失败时抛出，带上 HTTP 状态码，便于上层区分 404 / 500。 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new ApiError(`请求失败：${path}`, res.status);
  }
  return (await res.json()) as T;
}

/** 玩家实际拥有的物品（对应原 `RequestMoreItems()`） */
export function fetchItems(offset = 0, limit = 50): Promise<ItemsResponse> {
  return getJson<ItemsResponse>(`/api/items?offset=${offset}&limit=${limit}`);
}

/** 图鉴（对应原 `RequestCollectionData()`） */
export function fetchCollection(offset = 0, limit = 50): Promise<CollectionResponse> {
  return getJson<CollectionResponse>(`/api/collection?offset=${offset}&limit=${limit}`);
}

/** 界面文案的翻译表（对应原 `GetTranslationStrings()`） */
export function fetchI18n(): Promise<I18nMap> {
  return getJson<I18nMap>('/api/i18n');
}

/** 过滤器可选项 */
export function fetchFilterOptions(): Promise<FiltersOptions> {
  return getJson<FiltersOptions>('/api/filters/options');
}

/**
 * 物品图标的 URL。
 *
 * 图标不由远程服务提供（`static.iagd.evilsoft.net` 实测返回 403），
 * 而是走开发服务的 `/img` 端点从本地读取——详见 .docs/04-开发环境.md §8。
 */
export function iconUrl(icon: string): string {
  return icon ? `/img/${icon}` : '';
}
