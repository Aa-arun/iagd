# WebUI-next —— 新前端（React）

> 这是 `.docs/03-目标架构.md` 里"用 React 重做前端"的落地目录。
> 步骤见 [`.docs/05-实施计划.md`](../.docs/05-实施计划.md) §2「线 A」。

## 为什么是独立目录，而不是改造 `WebUI/`

`WebUI/` 是 **Preact** 项目，用 `@preact/preset-vite`。
这个预设会把 `react` 别名到 `preact/compat`，所以 **React 和 Preact 无法在同一项目里共存**。

更关键的是：`WebUI/` 的构建产物会被拷进 `IAGrim` 的 `Resources` 交给 WebView2 加载。
若直接在里面改造成 React，**现有程序会立刻加载到半成品界面**——违反
[`AGENT.md`](../AGENT.md) 的约束「功能行为不能坏」。

所以新前端独立开发，旧前端保持可构建、可回退，直到线 C 完成迁移。

## 开发

先启动开发数据服务（提供真实数据，见 [`tools/devapi`](../tools/devapi/README.md)）：

```bash
node tools/devapi/server.mjs     # → http://127.0.0.1:42500
```

再启动前端：

```bash
cd WebUI-next
npm install                      # 首次
npm run dev                      # → http://localhost:3000
```

`vite.config.ts` 已把 `/api` 与 `/img` 代理到 42500 端口，所以浏览器里是同源请求，不需要 CORS。

## 目录结构

按 `.docs/03-目标架构.md` §5.2，但**只建当前步骤需要的部分**：

```
src/
├── main.tsx          入口
├── App.tsx           根组件
├── api/              通信层
│   ├── rest.ts       REST 客户端
│   ├── types.ts      请求/响应类型
│   └── index.ts      统一出口
├── model/            领域模型（对应 C# 的 JsonItem）
│   ├── item.ts       IItem
│   ├── stats.ts      IStat
│   ├── skill.ts      ISkill
│   ├── collection.ts ICollectionItem
│   └── enums.ts      IItemType / 消息枚举
├── components/       通用组件
│   └── ItemCard/     物品卡片
└── styles/           全局样式与主题变量
```

`store/`、`views/`、`i18n/` 等到后续步骤再建。

## 当前进度

- [x] **A0** 显示一条真实物品（工具链 + 通信层通了）
- [ ] A1 物品列表
- [ ] A2 从后端拿列表（本步已部分完成）
- [ ] A3 搜索框
- [ ] A4 视图切换（P0 核心）
- [ ] A5 hover 详情面板（P0 核心）
- [ ] A6 转移物品
