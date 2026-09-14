import TableView from './TableView/TableView';
import CompactCardView from './CompactCardView/CompactCardView';
import CompareView from './CompareView/CompareView';
import type { ItemViewDefinition } from './types';

/**
 * ★ 视图注册表。
 *
 * **新增一种展示样式，只需要在这里加一行。** 切换器、数据加载、
 * 其他视图都不用改——这是 A4 要验证的架构点。
 *
 * 顺序即选择框里的显示顺序，第一项是默认视图。
 */
export const ITEM_VIEWS: ItemViewDefinition[] = [
  {
    id: 'table',
    label: '分栏列表',
    description: '表格式，关键信息分栏对齐，最适合精确找装备',
    component: TableView,
    /*
     * 只留固定栏（使用者 2026-09-14）：表格是逐行扫视的，
     * 浮动面板跟着鼠标会一直挡住相邻的行。默认右固定栏。
     */
    detailModes: ['docked-right', 'docked-left'],
  },
  {
    id: 'compact',
    label: '简洁卡片',
    description: '图标 + 名称 + 关键标签，适合快速浏览',
    component: CompactCardView,
    /*
     * 三种都保留（缺省即全允许）：网格里的卡片大小不一，浮动预览正合适。
     * 使用者对浮动面板的定位另有两条要求，见 CompactCardView 与
     * ItemDetailPanel 的说明。
     */
  },
  {
    id: 'compare',
    label: '详细对照',
    description: '把完整属性并排摊开，适合筛选后比较几件装备',
    component: CompareView,
    /*
     * 这个视图把 tooltip 全摊在卡片里（`showsFullStats`），不再挂侧栏面板；
     * 但它的「详情」下拉**不置灰**——而是管**卡片怎么排**（使用者 2026-09-14）：
     *   · 瀑布   → 高度随内容，布局是瀑布流（各列顶部错落）
     *   · 固定高度   → 卡片等高 = 内容区高度 × 0.8，超出时卡片内部滚动
     */
    showsFullStats: true,
    detailModes: ['full', 'fixed-height'],
  },
];

/** 默认视图（第一项）。 */
export const DEFAULT_VIEW_ID = ITEM_VIEWS[0].id;

/**
 * 按 id 找视图。找不到时**回退到默认视图**——
 * 这样即使用户存了一个已经删掉的视图 id，界面也不会白屏。
 */
export function findView(id: string): ItemViewDefinition {
  return ITEM_VIEWS.find((v) => v.id === id) ?? ITEM_VIEWS[0];
}
