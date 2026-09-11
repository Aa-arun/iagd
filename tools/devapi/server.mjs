#!/usr/bin/env node
/**
 * IAGD 开发用只读数据服务（Dev Data API）
 *
 * 两个目的：
 *   1. 让前端在浏览器里开发时拿到**真实游戏数据**，而不是 src/mock/ 里的假数据。
 *   2. 充当 `.docs/03-目标架构.md` §4.2 REST 接口草案的**可运行原型**——
 *      端点命名与草案一致，将来换成 C# 实现时前端无需改动。
 *
 * 安全保证：
 *   - 以 SQLite `readOnly` 打开 userdata.db，**结构上不可能写入或损坏原库**。
 *   - 只监听 127.0.0.1。
 *
 * 零第三方依赖：只用 Node 内置的 node:sqlite / node:http（需要 Node 22.5+）。
 *
 * 用法：
 *   node tools/devapi/server.mjs              # 默认端口 42500
 *   PORT=43000 node tools/devapi/server.mjs
 *   IAGD_DB=/path/to/userdata.db node tools/devapi/server.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

// ── 配置 ────────────────────────────────────────────────────────────────
const DEFAULT_DB = '/mnt/c/Users/jyl96/AppData/Local/EvilSoft/IAGD/data/userdata.db';
const DEFAULT_STORAGE = '/mnt/c/Users/jyl96/AppData/Local/EvilSoft/IAGD/storage';
// IA 自己的界面文案（`iatag_*`）不存于游戏数据库，而在仓库的翻译文件里。
// C# 运行时读的也是这份（IAGrim/Parsers/Arz/LocalizationLoader.cs）。
const DEFAULT_TRANSLATIONS = new URL('../../IAGrim/Resources/translations/zh.txt', import.meta.url);
const DB_PATH = process.env.IAGD_DB ?? DEFAULT_DB;
const STORAGE_DIR = process.env.IAGD_STORAGE ?? DEFAULT_STORAGE;
const TRANSLATIONS_PATH = process.env.IAGD_TRANSLATIONS ?? DEFAULT_TRANSLATIONS;
const PORT = Number(process.env.PORT ?? 42500);
const HOST = '127.0.0.1';
const MAX_LIMIT = 500;

// 对应前端 src/interfaces/ 的 `enum IItemType { Recipe, Buddy, Player, Augmentation }`
const ITEM_TYPE = { Recipe: 0, Buddy: 1, Player: 2, Augmentation: 3 };

if (!existsSync(DB_PATH)) {
  console.error(`✗ 找不到数据库：${DB_PATH}`);
  console.error('  用 IAGD_DB=<路径> 覆盖，或确认 Item Assistant 已至少运行过一次。');
  process.exit(1);
}

// ── 数据库（只读）───────────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH, { readOnly: true });

// 物品查询的公共 SELECT 部分。搜索（/api/search）要复用同一套字段，
// 否则两条路径返回的结构会悄悄分叉。
const ITEMS_SELECT = `
  SELECT
    pi.Id,
    pi.baserecord      AS BaseRecord,
    pi.PrefixRecord,
    pi.SuffixRecord,
    pi.MateriaRecord,
    pi.Mod,
    pi.Name,
    pi.Rarity,
    pi.LevelRequirement,
    pi.IsHardcore,
    pi.cloudid         AS CloudId,
    pi.cloud_hassync   AS CloudHasSync,
    pi.PrefixRarity,
    (SELECT s2.textvalue FROM DatabaseItemStat_v2 s2
       JOIN DatabaseItem_v2 d ON d.id_databaseitem = s2.id_databaseitem
      WHERE d.baserecord = pi.baserecord AND s2.stat LIKE '%itmap%' LIMIT 1) AS Icon,
    (SELECT s2.textvalue FROM DatabaseItemStat_v2 s2
       JOIN DatabaseItem_v2 d ON d.id_databaseitem = s2.id_databaseitem
      WHERE d.baserecord = pi.baserecord AND s2.stat = 'Class' LIMIT 1) AS Slot
  FROM PlayerItem pi
`;

const qItems = db.prepare(`${ITEMS_SELECT} ORDER BY pi.Id LIMIT ? OFFSET ?`);


const qItemCount = db.prepare(`SELECT COUNT(*) AS n FROM PlayerItem`);

// 图鉴查询直接复用 C# 的 ItemCollectionDaoImpl.GetItemCollection 的 SQL 结构
const qCollection = db.prepare(`
  SELECT
    item.baserecord AS BaseRecord,
    item.name       AS Name,
    (SELECT COUNT(*) FROM PlayerItem P WHERE P.baserecord = item.baserecord AND NOT ishardcore) AS NumOwnedSc,
    (SELECT COUNT(*) FROM PlayerItem P WHERE P.baserecord = item.baserecord AND ishardcore)     AS NumOwnedHc,
    (SELECT s2.textvalue FROM DatabaseItemStat_v2 s2
      WHERE s2.id_databaseitem = s.id_databaseitem AND s2.stat LIKE '%itmap%' LIMIT 1) AS Icon,
    s.textvalue AS Quality
  FROM DatabaseItemStat_v2 s, DatabaseItem_v2 item
  WHERE s.stat = 'itemClassification'
    AND (s.textvalue = 'Legendary' OR s.textvalue = 'Epic')
    AND item.id_databaseitem = s.id_databaseitem
    AND baserecord NOT LIKE '%/crafting/%'
    AND name IS NOT NULL
    AND name != ''
  ORDER BY item.name
  LIMIT ? OFFSET ?
`);

const qCollectionCount = db.prepare(`
  SELECT COUNT(*) AS n
  FROM DatabaseItemStat_v2 s, DatabaseItem_v2 item
  WHERE s.stat = 'itemClassification'
    AND (s.textvalue = 'Legendary' OR s.textvalue = 'Epic')
    AND item.id_databaseitem = s.id_databaseitem
    AND baserecord NOT LIKE '%/crafting/%'
    AND name IS NOT NULL AND name != ''
`);

const qI18n = db.prepare(`SELECT Tag, Name FROM ItemTag WHERE Name IS NOT NULL`);

/**
 * 解析 `key=value` 格式的翻译文件（UTF-8）。`#` 开头是注释，空行跳过。
 */
function loadTranslationFile(path) {
  if (!existsSync(path)) return {};
  const map = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq <= 0) continue;
    map[s.slice(0, eq)] = s.slice(eq + 1);
  }
  return map;
}

// IA 自己的界面文案（`iatag_*`，共 515 条）。它与游戏文本的 key 空间基本不重叠；
// 万一重叠，以界面文案为准——那是"这个程序自己想说的话"。
const iaTranslations = loadTranslationFile(TRANSLATIONS_PATH);
const qClasses = db.prepare(
  `SELECT DISTINCT textvalue AS v FROM DatabaseItemStat_v2 WHERE stat='Class' ORDER BY textvalue`);
const qQualities = db.prepare(
  `SELECT DISTINCT textvalue AS v FROM DatabaseItemStat_v2 WHERE stat='itemClassification' ORDER BY textvalue`);

// ── 属性翻译（简单层）────────────────────────────────────────────────────
// 详见 .docs/08-属性翻译.md。
//
// 核心发现：**大部分属性的 stat 名就是中文模板的 key**（同名直取）——
// C# 的 StatManager.cs:596 正是这么做的。所以简单层只需"有同名模板就显示"，
// 不必复刻那边 1005 行、28 个 Process* 方法。
//
// 实测（66 件真实物品、3450 条 stat）：该策略筛出的 70 种 stat
// 全部是真属性，**没有一条元数据混入**（mesh/sound/physics 等都没有同名模板）。

/** header 属性白名单——复刻 C# 的 MapSimpleHeaderEntries（核心属性，显示在顶部） */
const HEADER_STATS = new Set([
  'offensivePierceRatioMin',
  'defensiveProtection',
  'skillChanceWeight',
  'skillProjectileNumber',
  'skillCooldownTime',
  'skillManaCost',
  'skillTargetRadius',
  'skillActiveDuration',
]);

const qItemIdByRecord = db.prepare(`SELECT id_databaseitem FROM DatabaseItem_v2 WHERE baserecord = ?`);
const qRawStats = db.prepare(`SELECT Stat, TextValue, val1 FROM DatabaseItemStat_v2 WHERE id_databaseitem = ?`);

/** 对齐 C# 的 Math.Round(v, 1, MidpointRounding.AwayFromZero) */
function round1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return (Math.round(Math.abs(n) * 10) / 10) * sign;
}

/**
 * 把一件物品的原始 stat 行翻成前端的 `IStat[]`。
 * 返回 `{ headerStats, bodyStats }`——划分依据是 C# 的 header 白名单。
 */
function translateItemStats(baseRecord) {
  const headerStats = [];
  const bodyStats = [];

  const item = qItemIdByRecord.get(baseRecord);
  if (!item) return { headerStats, bodyStats };

  for (const s of qRawStats.all(item.id_databaseitem)) {
    const text = iaTranslations[s.Stat];
    // 没有同名模板 → 不是"要显示的属性"，而是引擎内部字段（mesh、sound、物理参数…）
    if (!text) continue;

    const stat = {
      text,
      param0: String(round1(s.val1)),
      param1: '',
      param2: '',
      // C# 的 MapSimpleBodyEntries 把 TextValue 放进 Param3（供 {3} 占位符使用）。
      // 它可能是 `class08` 这类 tag，也可能是已译好的技能名——能翻就翻。
      param3: iaTranslations[s.TextValue] ?? s.TextValue ?? '',
      param4: '',
      param5: '',
      param6: '',
    };
    (HEADER_STATS.has(s.Stat) ? headerStats : bodyStats).push(stat);
  }

  return { headerStats, bodyStats };
}

// ── 映射：数据库行 → 前端的 IItem ───────────────────────────────────────
// 逐字段对齐 C# 的 IAGrim/Utilities/ItemHtmlWriter.cs，
// 以及 IAGrim/UI/Controller/dto/JsonItem.cs 与前端 src/interfaces/IItem.tsx
function toJsonItem(r, headerStats = [], bodyStats = []) {
  return {
    // C#: $"PI/{pi.Id}/{pi.CloudId}"
    uniqueIdentifier: `PI/${r.Id}/${r.CloudId ?? ''}`,
    // C#: BaseRecord + PrefixRecord + SuffixRecord
    mergeIdentifier: `${r.BaseRecord ?? ''}${r.PrefixRecord ?? ''}${r.SuffixRecord ?? ''}`,
    baseRecord: r.BaseRecord ?? '',
    icon: r.Icon ?? '',
    quality: r.Rarity ?? '',
    name: r.Name ?? '',
    // C# 从物品名里解析插槽，这里暂不实现（见 README「已知未实现」）
    socket: '',
    slot: r.Slot ?? '',
    level: r.LevelRequirement ?? 0,
    // C#: new object[] { BaseRecord, Prefix, Suffix, Materia, Mod, IsHardcore }
    url: [r.BaseRecord ?? '', r.PrefixRecord ?? '', r.SuffixRecord ?? '', r.MateriaRecord ?? '', r.Mod ?? '', r.IsHardcore],
    type: ITEM_TYPE.Player,
    hasRecipe: false,
    greenRarity: r.PrefixRarity ?? 0,
    // 属性：由 translateItemStats 的"简单层"翻出（见 .docs/08-属性翻译.md）
    headerStats,
    bodyStats,
    petStats: [],
    skill: null,
    hasCloudBackup: !!r.CloudHasSync,
    isMonsterInfrequent: false,
    isHardcore: !!r.IsHardcore,
    replicaStats: [],
  };
}

// ── HTTP ────────────────────────────────────────────────────────────────
function send(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',   // 便于 Vite dev server 直连
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function page(url) {
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, MAX_LIMIT);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
  return { limit, offset };
}

// 物品图标：从本地 storage 目录提供。
// 数据库里的 icon 值形如 `items/gearhead/bitmaps/c216_head.tex`，
// 本地文件名则是扁平化的 `c216_head.tex.png` —— 取 basename 再补 .png 即可。
// 之所以本地提供而不是用 http://static.iagd.evilsoft.net：该远程服务实测返回 403。
function serveIcon(url, res) {
  const name = basename(decodeURIComponent(url.pathname.slice('/img/'.length)));
  if (!name || name.includes('..')) {
    return send(res, 400, { error: 'bad icon name' });
  }
  const file = join(STORAGE_DIR, `${name}.png`);
  if (!existsSync(file)) {
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    return res.end('icon not found');
  }
  const buf = readFileSync(file);
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': buf.length,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  });
  res.end(buf);
}

// ── 搜索（POST /api/search）──────────────────────────────────────────────
// 请求体的 JSON 结构定义见 .docs/03-目标架构.md §4.4。
//
// ★ 语义对齐 C# 的 PlayerItemDaoImpl.SearchForItems（该文件 807 行起）：
//   - `Mod` 为空字符串 = "只看非 Mod 物品"（不是"不过滤"）
//   - `wildcard` 的**空格会被换成 %**，所以"神话 面具"能匹配"神话 费坦面具"
//   - `isHardcore` 是**二选一**（查普通仓库还是硬核仓库），不是可选过滤

function pageFromBody(body) {
  const limit = Math.min(Number(body.limit ?? 50) || 50, MAX_LIMIT);
  const offset = Math.max(Number(body.offset ?? 0) || 0, 0);
  return { limit, offset };
}

/** 读取并解析 JSON 请求体（1 MB 上限，防止畸形请求拖垮进程） */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error('请求体过大'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 搜索玩家物品。
 *
 * **已实现**：`wildcard` / `minimumLevel` / `maximumLevel` / `rarity` /
 * `isHardcore` / `socketedOnly`。
 *
 * **结构已定义但未实现**（留待后续步骤或线 B）：`slot` / `classes` /
 * `filters` / `statValueFilters` / `duplicatesOnly` / `hasPetBonus` 等。
 * 传了也不会报错，只是不生效。
 */
function searchItems(query) {
  const req = query ?? {};
  const { limit, offset } = pageFromBody(req);

  const where = [];
  const params = [];

  where.push("(pi.Mod IS NULL OR pi.Mod = '')");
  where.push(req.isHardcore ? 'pi.IsHardcore' : 'NOT pi.IsHardcore');

  if (req.wildcard) {
    where.push('pi.namelowercase LIKE ?');
    params.push(`%${String(req.wildcard).toLowerCase().replace(/ /g, '%')}%`);
  }
  if (Number(req.minimumLevel) > 0) {
    where.push('pi.LevelRequirement >= ?');
    params.push(Number(req.minimumLevel));
  }
  if (Number(req.maximumLevel) > 0) {
    where.push('pi.LevelRequirement <= ?');
    params.push(Number(req.maximumLevel));
  }
  if (req.rarity) {
    where.push('pi.Rarity = ?');
    params.push(String(req.rarity));
  }
  if (req.socketedOnly) {
    where.push("(pi.MateriaRecord IS NOT NULL AND pi.MateriaRecord != '')");
  }

  const clause = where.map((w) => `AND ${w}`).join(' ');
  const withStats = req.stats !== false;

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM PlayerItem pi WHERE 1=1 ${clause}`)
    .get(...params).n;

  const rows = db
    .prepare(`${ITEMS_SELECT} WHERE 1=1 ${clause} ORDER BY pi.Id LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  const items = rows.map((r) => {
    const { headerStats, bodyStats } = withStats
      ? translateItemStats(r.BaseRecord)
      : { headerStats: [], bodyStats: [] };
    return toJsonItem(r, headerStats, bodyStats);
  });

  return { total, offset, limit, items };
}

const routes = {
  '/api/health': () => ({ ok: true, db: DB_PATH, readOnly: true }),

  // 对应前端 RequestMoreItems() → WebSocket SetItems(5)
  '/api/items': (url) => {
    const { limit, offset } = page(url);
    const total = qItemCount.get().n;
    // `stats=0` 可关闭属性翻译（物品很多时用来提速）
    const withStats = url.searchParams.get('stats') !== '0';
    const items = qItems.all(limit, offset).map((r) => {
      const { headerStats, bodyStats } = withStats
        ? translateItemStats(r.BaseRecord)
        : { headerStats: [], bodyStats: [] };
      return toJsonItem(r, headerStats, bodyStats);
    });
    return { total, offset, limit, items };
  },

  // 对应 RequestCollectionData() → SetCollectionItems(6)
  '/api/collection': (url) => {
    const { limit, offset } = page(url);
    const total = qCollectionCount.get().n;
    const items = qCollection.all(limit, offset).map((r) => ({
      baseRecord: r.BaseRecord,
      name: r.Name,
      icon: r.Icon ?? '',
      quality: r.Quality ?? '',
      numOwnedSc: r.NumOwnedSc,
      numOwnedHc: r.NumOwnedHc,
    }));
    return { total, offset, limit, items };
  },

  // 对应 GetTranslationStrings()
  '/api/i18n': () => {
    const map = {};
    for (const r of qI18n.all()) map[r.Tag] = r.Name;
    return { ...map, ...iaTranslations };
  },

  // 03-目标架构.md 的「新增」端点
  '/api/filters/options': () => ({
    classes: qClasses.all().map((r) => r.v),
    qualities: qQualities.all().map((r) => r.v),
  }),
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // 图标走二进制通道，不经过 JSON 路由
  if (url.pathname.startsWith('/img/')) {
    return serveIcon(url, res);
  }

  // 搜索是唯一的 POST 端点。注意它仍然是**只读查询**——
  // 用 POST 只是因为搜索条件（过滤器数组）放在请求体里更自然。
  if (req.method === 'POST' && url.pathname === '/api/search') {
    try {
      const body = await readJsonBody(req);
      return send(res, 200, searchItems(body));
    } catch (err) {
      console.error('✗ /api/search', err.message);
      return send(res, 400, { error: err.message });
    }
  }

  const handler = routes[url.pathname];
  if (!handler) {
    return send(res, 404, {
      error: 'not found',
      available: [...Object.keys(routes), 'POST /api/search'],
      note: '本服务是**只读**的：transfer 等写操作属于线 B，尚未实现。',
    });
  }

  try {
    send(res, 200, handler(url));
  } catch (err) {
    console.error(`✗ ${url.pathname}`, err.message);
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log('IAGD 开发数据服务（只读）');
  console.log(`  监听   http://${HOST}:${PORT}`);
  console.log(`  数据库 ${DB_PATH}`);
  console.log(`  图标库 ${STORAGE_DIR}`);
  console.log(`  翻译   IA 界面文案 ${Object.keys(iaTranslations).length} 条 + 游戏文本 ${qI18n.all().length} 条`);
  console.log(`  物品   ${qItemCount.get().n} 件（玩家实际拥有）`);
  console.log(`  图鉴   ${qCollectionCount.get().n} 条`);
  console.log('');
  console.log('  端点：');
  for (const p of Object.keys(routes)) console.log(`    GET  ${p}`);
  console.log('    GET  /img/<icon>       （物品图标，本地提供）');
  console.log('    POST /api/search       （搜索；仍是只读查询）');
});
