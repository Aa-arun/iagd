# tools/devapi —— 开发用只读数据服务

> ⚠️ **已退役（2026-09-12）**
>
> 新前端现在连的是 **C# 自带的服务**（`127.0.0.1:3031`，见
> [`.docs/04-开发环境.md`](../../.docs/04-开发环境.md) §9），不再需要这个 Node 服务。
>
> **留着它的价值**：里面有几处**独立的验证结论**（属性翻译的分层、两个后端的数据形状比对、
> 沙盒写模式），排查问题时可以交叉对照。
>
> 下面保留原始说明，供查阅。
>
> ---

让前端在**浏览器里开发时拿到真实游戏数据**，而不是 `WebUI/src/mock/` 里的假数据。
同时它是 [`.docs/03-目标架构.md`](../../.docs/03-目标架构.md) §4.2 **REST 接口草案的可运行原型**——
端点命名与草案一致，将来换成 C# 实现时前端不需要改。

## 特性

- **只读**：以 SQLite `readOnly` 模式打开 `userdata.db`，**结构上不可能**写入或损坏原库。
- **零依赖**：只用 Node 内置的 `node:sqlite` / `node:http`（需要 Node 22.5+）。
- **本地图标**：物品图标由本地 `storage/` 提供，不依赖已失效的远程服务。

## 运行

```bash
node tools/devapi/server.mjs
# → http://127.0.0.1:42500
```

环境变量可覆盖默认路径：

| 变量 | 默认值 |
|---|---|
| `IAGD_DB` | `C:\Users\<你>\AppData\Local\EvilSoft\IAGD\data\userdata.db` |
| `IAGD_STORAGE` | `C:\Users\<你>\AppData\Local\EvilSoft\IAGD\storage` |
| `PORT` | `42500` |

## 端点

| 端点 | 对应原方法 | 说明 |
|---|---|---|
| `GET /api/health` | — | 健康检查，返回数据库路径 |
| `GET /api/items?offset=&limit=` | `RequestMoreItems()` | ★ **玩家实际拥有的物品** |
| `GET /api/collection?offset=&limit=` | `RequestCollectionData()` | 图鉴（传奇/史诗 + 拥有数量） |
| `GET /api/i18n` | `GetTranslationStrings()` | `ItemTag` 表导出的 tag→中文 映射 |
| `GET /api/filters/options` | **新增** | 可选槽位（Class）与品质 |
| `GET /img/<icon>` | — | 物品图标（本地 PNG） |

`/api/items` 返回的每个对象**逐字段对齐**前端的 `IItem`（`WebUI/src/interfaces/IItem.tsx`），
映射规则取自 C# 的 `IAGrim/Utilities/ItemHtmlWriter.cs` 与
`IAGrim/UI/Controller/dto/JsonItem.cs`，例如：

| 字段 | 来源 |
|---|---|
| `uniqueIdentifier` | `PI/{Id}/{CloudId}`（与 C# 完全一致） |
| `mergeIdentifier` | `BaseRecord + PrefixRecord + SuffixRecord` |
| `icon` | `DatabaseItemStat_v2` 中 `stat like '%itmap%'` 的 textvalue |
| `url` | `[BaseRecord, Prefix, Suffix, Materia, Mod, IsHardcore]`（转移用） |
| `type` | `2` = `IItemType.Player` |
| `slot` | `stat='Class'` 的 textvalue |

## 已知未实现

| 项 | 原因 |
|---|---|
| `headerStats` / `bodyStats` / `petStats` | 需要 `StatTranslator` 的属性翻译逻辑（游戏数据解析），属线 B 范畴。目前返回 `[]` |
| `socket` | C# 从物品名解析，逻辑未复刻。目前返回 `''` |
| `POST /api/search`、`POST /api/items/transfer` | 写操作，属线 B。本服务只读 |
| WebSocket 推送 | 同上 |

**这不影响 P0 目标**：布局、卡片、列表、图标、品质配色都只依赖已实现的字段。

## 前端接入（尚未做）

`03-目标架构.md` §3.2 的设计是 Vite 把 `/api` 代理到后端。
接入时在 `WebUI/vite.config.ts` 加：

```ts
server: { proxy: { '/api': 'http://127.0.0.1:42500', '/img': 'http://127.0.0.1:42500' } }
```

**未擅自修改** `WebUI/` 下任何文件——接入方式待定。
