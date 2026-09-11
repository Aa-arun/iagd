import type {
  AppSettings,
  FiltersOptions,
  I18nMap,
  ItemSearchRequest,
  ItemsResponse,
  SettingsUpdate,
  TransferResult,
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

/**
 * 搜索物品（对应原 WinForms 搜索框构造的 `ItemSearchRequest`）。
 *
 * 用 POST 只是为了把过滤条件放进请求体（数组/嵌套结构用 query string 表达很别扭）；
 * 它**仍然是只读查询**，不会改动任何数据。
 */
export async function searchItems(query: ItemSearchRequest): Promise<ItemsResponse> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) {
    throw new ApiError('搜索失败', res.status);
  }
  return (await res.json()) as ItemsResponse;
}

/** 界面文案的翻译表（对应原 `GetTranslationStrings()`） */
export function fetchI18n(): Promise<I18nMap> {
  return getJson<I18nMap>('/api/i18n');
}

/** 过滤器可选项 */
export function fetchFilterOptions(): Promise<FiltersOptions> {
  return getJson<FiltersOptions>('/api/filters/options');
}

/** 读取设置（只含用户可改的那些） */
export function fetchSettings(): Promise<AppSettings> {
  return getJson<AppSettings>('/api/settings');
}

/**
 * 保存设置（**增量**）。
 *
 * 只提交改动的字段——后端用可空字段表示"这项不改"，
 * 避免整份覆盖带来的竞态与意外重置。
 * 后端设属性时会自动落盘，不需要额外的 save 调用。
 */
export async function saveSettings(update: SettingsUpdate): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    throw new ApiError('保存设置失败', res.status);
  }
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

/**
 * 转移物品回游戏（**写操作**）。
 *
 * 对应原 `TransferItem(url[], transferAll)`。
 *
 * ⚠️ 两处与真实后端的差异，见 [`.docs/03-目标架构.md`](../../../.docs/03-目标架构.md) §4.5：
 * 1. 真实 C# 接受 identifier 数组（Base/Prefix/Suffix/…），这里简化为直接传 `PlayerItem.Id`；
 * 2. 真实程序还会把物品写进**游戏共享仓库存档**，devapi 只模拟数据库侧的效果。
 */
export async function transferItems(
  ids: number[],
  transferAll: boolean,
): Promise<TransferResult> {
  const res = await fetch('/api/items/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids, transferAll }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(detail?.error ?? '转移失败', res.status);
  }
  return (await res.json()) as TransferResult;
}
