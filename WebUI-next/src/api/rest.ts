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

/** 后端健康状态。 */
export interface HealthResponse {
  ok: boolean;
  port: number;
  readOnly: boolean;
  /** 正在重建游戏数据库：这期间所有查询都会被拒（503） */
  maintenance: boolean;
  maintenanceMessage?: string;
  /** 维护任务的详细状态（含进度），供页面加载时恢复 */
  maintenanceState?: MaintenanceState;
}

/**
 * 查后端状态。
 *
 * ⚠️ 存在的理由：`maintenance` 只在**状态变化时**通过 WebSocket 广播，
 * 所以如果页面是在维护**开始之后**才打开的，它永远收不到那条消息，
 * 只会看到一堆 503。页面初次加载时靠这个接口补上状态。
 */
export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health');
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

// ── 动作（设置页第二栏）─────────────────────────────────────────────────

/** 重置设置的响应 */
export interface ResetSettingsResult {
  success: boolean;
  /** 重置前自动备份的设置文件路径 */
  backup: string | null;
  /** 重置后的设置值——后端顺带返回，前端据此立即刷新，不必再发一次 GET */
  settings: AppSettings;
}

/**
 * 重置设置。
 *
 * ⚠️ 备份的是**设置文件**（`settings.json`），不是物品数据。
 *
 * ★ 这是**热重置**：后端只把界面上能改的那几项恢复初始值，
 * **不重启程序**——调用返回后界面已经在跑，用返回的 `settings` 刷新即可。
 */
export async function resetSettings(): Promise<ResetSettingsResult> {
  const res = await fetch('/api/settings/reset', { method: 'POST' });
  if (!res.ok) {
    throw new ApiError('重置设置失败', res.status);
  }
  return (await res.json()) as ResetSettingsResult;
}

/** 导出设置的下载地址（直接用 `<a download>` 或 `location.href` 触发） */
export const SETTINGS_EXPORT_URL = '/api/settings/export';

/**
 * 导入设置（把文件内容作为 JSON 文本提交，不走 multipart）。
 * 成功后后端同样会重启程序。
 */
export async function importSettings(json: string): Promise<void> {
  const res = await fetch('/api/settings/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  });
  if (!res.ok) {
    throw new ApiError('导入设置失败', res.status);
  }
  const result = (await res.json()) as { success: boolean; error?: string };
  if (!result.success) {
    throw new Error(result.error ?? '导入失败');
  }
}

/** 在资源管理器里打开目录：`backups` = 备份目录，`logs` = 数据目录（含 log.txt） */
export async function openFolder(target: 'backups' | 'logs'): Promise<void> {
  const res = await fetch(`/api/open/${target}`, { method: 'POST' });
  if (!res.ok) {
    throw new ApiError('打开目录失败', res.status);
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
 * ⚠️ 与旧接口的差异：真实 C# 后端的 `/api/items/transfer` 接受的是
 * `PlayerItem.Id` 数组（由后端自己拼成 `["PI", id, ...]` 的 identifier），
 * 而不是前端传 Base/Prefix/Suffix。
 *
 * 注意后端**失败时也返回 HTTP 200**（`{success:false, error:"…"}`），
 * 所以只看 `res.ok` 会把"转移失败"当成"已转移 0 件"。必须判 `success`。
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

  const result = (await res.json()) as TransferResult & { error?: string };
  if (!result.success) {
    throw new ApiError(result.error ?? '转移失败', res.status);
  }
  return result;
}

// ── 数据库 / Mods 维护（线 B）────────────────────────────────────────────
//
// 这四个操作原来在一个 WinForms 窗口里。写操作都**立即返回**，进度走 WebSocket；
// 页面刷新后用 `fetchMaintenanceStatus()` 恢复当前进度。

export interface GrimDawnLocation {
  name: string;
  path: string;
}

/** 维护任务状态。字段与 C# 的 `MaintenanceStateDto` 对应。 */
export interface MaintenanceState {
  busy: boolean;
  /** loadDatabase / cleanDatabase / clearCache */
  task?: string;
  /** 阶段名，如 LoadingItems。中文映射见 model/maintenance.ts */
  phase?: string;
  percent: number;
  phaseNumber: number;
  phaseCount: number;
  /** 上一次任务的错误，成功则没有 */
  error?: string;
}

export interface MaintenanceActionResult {
  success: boolean;
  error?: string;
}

export async function fetchGrimDawnInstalls(): Promise<GrimDawnLocation[]> {
  const res = await getJson<{ installs: GrimDawnLocation[] }>('/api/grimdawn/installs');
  return res.installs;
}

export async function fetchGrimDawnMods(): Promise<GrimDawnLocation[]> {
  const res = await getJson<{ mods: GrimDawnLocation[] }>('/api/grimdawn/mods');
  return res.mods;
}

export function fetchMaintenanceStatus(): Promise<MaintenanceState> {
  return getJson<MaintenanceState>('/api/maintenance/status');
}

async function postAction(path: string, body?: unknown): Promise<MaintenanceActionResult> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const result = (await res.json().catch(() => null)) as MaintenanceActionResult | null;
  if (!res.ok) {
    throw new ApiError(result?.error ?? `请求失败：${path}`, res.status);
  }

  return result ?? { success: false };
}

/**
 * 指定 Grim Dawn 安装目录。
 *
 * ⚠️ 浏览器**不能**打开原生文件夹选择器（安全限制），所以这里是让使用者
 * 把路径粘进来，由后端校验目录里有没有 `Grim Dawn.exe`。
 */
export function configureGrimDawn(path: string): Promise<MaintenanceActionResult> {
  return postAction('/api/grimdawn/configure', { path });
}

export function startLoadDatabase(install: string, mod?: string): Promise<MaintenanceActionResult> {
  return postAction('/api/maintenance/load', { install, mod });
}

export function startCleanDatabase(): Promise<MaintenanceActionResult> {
  return postAction('/api/maintenance/clean');
}

export function startClearCache(): Promise<MaintenanceActionResult> {
  return postAction('/api/maintenance/clear-cache');
}
