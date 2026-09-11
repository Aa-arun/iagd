# WebUI-next —— 新前端（React）

> `.docs/03-目标架构.md` 里"用 React 重做前端"的落地目录。
> **自 2026-09-12 起它就是程序实际使用的界面**（构建产物部署在 `storage/`）。
> 进度见 [`.docs/00-当前状态.md`](../.docs/00-当前状态.md)。

## 与旧前端（`WebUI/`）的关系

`WebUI/` 是 **Preact** 项目，用 `@preact/preset-vite`——该预设会把 `react` 别名到
`preact/compat`，所以 **React 和 Preact 无法在同一项目里共存**，新前端从一开始就是独立目录。

**当前状态**：`storage/` 里的前端产物**已替换为这里的构建结果**，
程序启动会打开系统浏览器加载它（`127.0.0.1:3031`）。
`WebUI/` 的产物备份在 `~/iagd-backup-storage-frontend/`，**代码保留未删**——
它的界面仍挂在 WebView2 上（已失效），彻底移除是 **B5/B6**。

## 开发流程

**改 → 构建 → 拷进 `storage/` → 刷新浏览器**（程序**不需要重启**）：

```bash
cd WebUI-next
npm install          # 首次
npm run build

S=/mnt/c/Users/jyl96/AppData/Local/EvilSoft/IAGD/storage
rm -rf "$S/assets"   # 文件名带内容哈希，不清会越积越多
cp -r build/. "$S/"
```

> ⚠️ **`npm run dev` 在当前环境下不可用**：vite dev server 要访问 C# 的
> `127.0.0.1:3031`，而 **WSL 访问不到 Windows 的 loopback**。
> `vite.config.ts` 里的 `IAGD_API_TARGET` 机制保留着，将来环境变了可以直接用。

## 目录结构

```
src/
├── main.tsx          入口
├── App.tsx           根组件（顶层页签：物品 / 设置）
├── api/              通信层
│   ├── rest.ts       REST 客户端（含动作：重置/导入导出/打开目录）
│   ├── types.ts      请求/响应类型（含 AppSettings）
│   └── index.ts      统一出口
├── model/            领域模型（对应 C# 的 JsonItem）
│   ├── item.ts       IItem（+ playerItemId 解析）
│   ├── stats.ts      IStat
│   ├── skill.ts      ISkill
│   ├── slot.ts       槽位显示名（复刻 C# SlotTranslator）
│   ├── format.ts     数字格式化（两个后端的形状差异，见 .docs/03 §4.6）
│   └── enums.ts      IItemType / 消息枚举
├── i18n/             翻译（React Context）
├── views/            页面与视图
│   ├── registry.ts   ★ 视图注册表——新增展示样式只改这里
│   ├── types.ts      ItemViewProps（视图只接收 items + 回调）
│   ├── ViewSwitcher.tsx      视图选择框 + 记住偏好
│   ├── TableView/            ① 分栏列表
│   ├── CompactCardView/      ② 简洁卡片
│   └── SettingsView/         ★ 设置页（两栏：设置项 / 动作）
├── components/       通用组件
│   ├── ItemCard/     物品卡片
│   ├── ItemDetail/   ★ 详情面板（全应用单实例；hover 预览 + 点击固定 + 转移）
│   └── SearchBar/    搜索框
└── styles/           全局样式与主题变量
```

### 加一种新的展示样式

按 `03-目标架构.md` §6.1 的设计只需两步：

1. 在 `src/views/` 下新建组件，props 用 `ItemViewProps`（**只接收 `items` + 回调，不要自己取数据**）
2. 在 `src/views/registry.ts` 的 `ITEM_VIEWS` 里加一行

切换器、数据加载、其他视图都不用动。

## ★ 布局与响应式（断点只有一处）

设置页有嵌套的两层结构，但**所有断点统一在 800px**。这样窄屏时各层同时切换，
不会出现"外层已经上下堆叠、内层还在硬撑两列"的错位。

| 宽度 | 设置页整体 | Stash Configuration 两组 |
|---|---|---|
| **> 800px** | 设置栏 ｜ 动作栏（左右） | 「将物品移至 / 放入」**左右并排** |
| **≤ 800px** | 设置栏 / 动作栏（**上下**） | **上下堆叠** |

```css
.settings-layout { grid-template-columns: minmax(0, 520px) minmax(200px, 240px); }
.settings-stash  { grid-template-columns: 1fr 1fr; }

@media (max-width: 800px) {
  .settings-layout { grid-template-columns: minmax(0, 1fr); }
  .settings-stash  { grid-template-columns: 1fr; }
}
```

**两个踩过的坑（改这块前先看）**：

1. **第一栏给了 520px 上限**：设置项都是短标签＋开关，拉满宽屏时眼睛要横跨半个屏幕，
   很难读。所以整体也限宽（`max-width: 820px`）。
2. **Stash 两组**不能**用 `flex-wrap`**：最初是 `flex: 1 1 260px` + `wrap`，
   结果**永远堆成上下**——因为外层栏自己有 520px 上限，260×2 加间距已经放不下，
   与窗口多宽无关。改用 grid 两列并把断点对齐外层才好。

> **设置页分两栏的理由**：左边全是**可逆**的开关（改错再点一下就回来），
> 右边是重置/导入这类**不可逆**的操作。混在一起容易误点。

## 进度

- [x] **A0–A6 全部完成**：真实物品列表、视图切换、搜索、hover 详情面板、物品转移
- [x] **设置页**：设置项（隐藏技能 / 搜索延迟 / 转移到任意 Mod / 压缩备份 / Stash Configuration）
      + 动作（重置设置 / 导入 / 导出 / 查看备份 / 查看日志）
- [x] **「已保存」提示**：硬切入 → 1 秒后淡出
- [x] ~~图鉴页~~ **已删除**（使用者确认不需要）

**P0 目标**（可切换的装备展示界面 + hover 详情）在 A4/A5 达成。

## 转移需要沙盒写服务（只在验证时用）

转移是**写操作**。程序自己的服务（`3031`）是真后端，**能写真实数据库**；
若只想验证、不想动真实数据，可以用当初的沙盒机制：

```bash
mkdir -p ~/iagd-sandbox
cp ~/iagd-db-backup/userdata-20260911.db ~/iagd-sandbox/userdata.db
chmod u+w ~/iagd-sandbox/userdata.db

IAGD_DB=$HOME/iagd-sandbox/userdata.db IAGD_WRITABLE=1 PORT=42501 \
  node tools/devapi/server.mjs
```

> **安全闸**：`IAGD_WRITABLE=1` 且库是原库时，服务**拒绝启动**。
> 详见 [`.docs/04-开发环境.md`](../.docs/04-开发环境.md) §8.7。
