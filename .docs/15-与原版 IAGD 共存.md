# 15 · 与原版 IAGD 共存

> 本文回答：**我们的构建和 `C:\Program Files\IAGD\IAGrim.exe`（原版）能不能一起用？
> 为什么原版"打不开"？想共存要改哪些地方？**
>
> 起因：使用者 2026-09-14 提问——"现在的程序和老的 iagd 是不能共存的吗？就算不同时
> 打开，老的 iagd 的也无法正常打开？最好能够共存。"（**先调研，不实现**。）

---

## 1. 一句话结论

**不能同时运行**（互斥体 + 共用数据库/转移队列），**顺序运行目前也不安全**（共用数据
目录、原版会覆盖我们在用的前端、我们启动时会迁移数据库）。

想真正共存，最稳的是**把数据目录、单实例互斥体、HTTP 端口三样全部改成独立的**，
代价是数据要复制一份、两套库从此各自独立。**建议先不做**（见 §6）。

---

## 2. 两者共用什么（已确认）

原版和我们的构建都是 IAGrim，`GlobalPaths.CoreFolder` 写死同一个路径：

```
%LOCALAPPDATA%\EvilSoft\IAGD\
├── userdata.db          ← 物品库（Release；Debug 用 userdata-test.db）
├── settings.json        ← 全部设置（Debug 是 settings-debug.json）
├── storage\             ← 前端产物 + 4573 张物品图标 + static\
├── data\                ← UserdataFolder
├── itemqueue\           ← 转移用的 CSV 队列（ingoing / outgoing / deleted）
├── replica\             ← tooltip 复制数据（from_ia / to_ia）
├── backup\              ← 自动备份（含 characters\ 角色存档）
├── edge\ debug\ linuxhack\
└── log.txt 等日志
```

代码位置：`IAGrim/Utilities/GlobalPaths.cs`（`CoreFolder` 等属性）。

> ★ 只读的东西不冲突：游戏存档目录（`Documents\My Games\Grim Dawn\Save`）、
>   数据库解析出的图标都是"读"为主。冲突集中在**可写状态**上。

---

## 3. 为什么不能同时运行

### 3.1 单实例互斥体（已确认，这是"原版打不开"的头号原因）

`IAGrim/Program.cs`：

```csharp
Guid guid = new Guid("{F3693953-C090-4F93-86A2-B98AB96A9368}");
using (SingleInstance singleInstance = new SingleInstance(guid)) {
    if (singleInstance.IsFirstInstance) { ... Run(args); }
    else {
        ShowExistingInstanceMessage.Notify();   // 通知已有实例"显示自己"
        // 然后本进程直接退出
    }
}
```

`SingleInstance` 就是 `new Mutex(true, guid.ToString())`（见
`EvilsoftCommons/SingleInstance/SingleInstance.cs`）。这个 GUID 来自上游
（`git log -S F3693953` 追到上游提交），**原版用的是同一个**。

于是：

- 原版先开 → 我们再开：**我们静默退出**。
- 我们先开（托盘里挂着）→ 原版再开：原版判定"已有实例"→ 给我们的进程发
  `ShowExistingInstanceMessage` → **原版自己退出**。

⚠️ **后者极易被误判成"原版坏了"**：我们的主窗口是**永不显示**的
（见 `10-界面解耦.md`），"通知第一个实例显示窗口"在我们这里没有任何可见效果，
所以原版的表现就是"双击了、什么都没有"。任务管理器里其实有两个同名进程
（`C:\Program Files\IAGD\IAGrim.exe` 与 `C:\Users\jyl96\iagd-release\IAGrim.exe`）。

> 排查第一步：**先确认托盘 / 任务管理器里没有我们在跑**，再启动原版。

### 3.2 数据库与转移队列

就算绕过互斥体，两边共用 `userdata.db` 和 `itemqueue\`：

- SQLite 会加文件锁，但两边都可能"先读到、后写回"，**物品可能重复或丢失**；
- `SingleInstance` 的源码注释写得很直白：
  *"Running multiple instances could result in item duplication"*。

所以**同时运行这条路不该走**。

### 3.3 HTTP 端口

我们的构建固定监听 `127.0.0.1:3031`（`IAGrim/Http/WebServer.cs` 的 `Port = 3031`）。
原版用 CefSharp / WebView2 内嵌浏览器，**不监听端口**，所以端口本身不是冲突点；
但它是"共存后要给新版换掉"的东西之一（同时开两个新版才会撞）。

---

## 4. 为什么"顺序运行"也可能出问题

### 4.1 storage 被原版覆盖（已确认，已有自愈）

原版启动时把**它自带的旧前端**解压进共用的 `storage\`，于是"开一次原版，浏览器
界面就变回旧样式"（2026-09-12 实测）。我们这边已经做了自愈：
`Services/FrontendDeployer.cs` 每次启动比较 `index.html`，不一致就重新铺一遍
（只碰前端文件，不碰图标）。**这不是"打不开"，是"界面被换掉"。**

### 4.2 数据库被我们的迁移改造（已确认会改，影响待确认）

我们启动时跑 `Database/Migrations/MigrationHandler.cs` 一整套：

| 迁移 | 做了什么 |
|---|---|
| `EnableWalJournalMode` | 把库改成 WAL 日志模式（多出 `-wal` / `-shm` 文件） |
| `AddBaseTables` / `HbmSchemaMigration` | 按 `.hbm.xml` 补表、补列 |
| `AddAsterkarnFieldsToPlayerItem/BuddyItems` | 加几个 DLC 字段 |
| **`FixPlayerItemIdTypeMigration`** | **重建 `PlayerItem` 表**（主键 `LONG` → `INTEGER`），**不认识的列会被丢掉** |
| **`FixDatabaseItemIdTypeMigration`** | 重建 `DatabaseItem_v2`（失败时甚至**清空重建**） |
| `RefreshSearchableReplicaText` | 重算搜索文本 |

> ⚠️ 待确认：原版"顺序运行也打不开"的确切原因**没有实测证据**。上面的迁移是主要
> 嫌疑（尤其两张表的重建），但也没有排除"原版自身版本较旧 / 设置文件不兼容 /
> 只是 3.1 的互斥体误判"。**下一步应看原版自己的日志**
> （`%LOCALAPPDATA%\EvilSoft\IAGD\log.txt`、`debug\`）再下结论。

### 4.3 settings.json

两边共用同一个 `settings.json`。新版读旧文件没问题（缺字段走默认值）；原版读新版
写出的文件，理论上也会忽略不认识的字段。⚠️ 待确认：我们改过的设置项里有没有
**同名但类型不同**的字段——那会让原版反序列化失败。

### 4.4 备份目录

两边都往 `backup\` 写。不会互相破坏，但内容混在一起，出问题时不好判断是谁备的。

---

## 5. 想共存要改哪三处

| # | 位置 | 现状 | 共存改法 |
|---|---|---|---|
| 1 | `IAGrim/Utilities/GlobalPaths.cs` → `CoreFolder` | `%LOCALAPPDATA%\EvilSoft\IAGD` | 加后缀，如 `…\IAGD-next`（**数据库、图标、备份、设置全部随之独立**） |
| 2 | `IAGrim/Program.cs` → 互斥体 GUID | `{F3693953-…}` | 换一个新 GUID（原版才能同时启动） |
| 3 | `IAGrim/Http/WebServer.cs` → `Port` | `3031` | 换 `3032` 之类（两条前端各自访问自己的后端） |

顺带要处理的：

- **首次迁移**：新目录是空的 → 需要把 `userdata.db`、`settings.json`、
  `storage\*.tex.png`（4573 张图标）、`backup\` 复制过去，或干脆让新库从零解析。
- **Hook / CSV 队列**：注入游戏的 hook 会读 `itemqueue\outgoing`——两个程序各自
  有自己的队列目录，反而更安全。
- 前端不用改：它请求的是**同源**的相对路径 `/api/*`，端口跟着页面走。

---

## 6. 结论与建议

| 方案 | 做法 | 代价 / 风险 |
|---|---|---|
| **A. 完全隔离**（推荐，将来要做就做这个） | 数据目录 + 互斥体 + 端口三处全改；首次复制数据 | 一次性复制几百 MB 图标；之后两套数据**各自独立**（互不见对方新捡的装备） |
| **B. 半隔离** | 只换互斥体 + 端口，共用 `userdata.db` | 省事；但两边轮流启动时都要跑一遍 schema 迁移，**风险仍在**，且不能同时开 |
| **C. 保持现状** | 用哪个开哪个，开之前确认另一个已退出 | 零成本；原版启动会覆盖 storage（我们有自愈）；**"原版打不开"多半只是互斥体，先看进程** |

**我们的建议：先按 C 用着，把"原版打不开"的日志抓来看一眼**（区分是互斥体
还是真的崩了）。确认原因后，如果确实需要并用，再按 **A** 做——因为它的核心价值
不是"能同时开"，而是**两套数据互不干扰**，这才是 AGENT.md 约束里的
"已有数据不能丢"。

> 使用者 2026-09-14 的决定：**先调研，不做**。本文就是这次调研的产出。
