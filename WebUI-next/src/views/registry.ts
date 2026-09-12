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
  },
  {
    id: 'compact',
    label: '简洁卡片',
    description: '图标 + 名称 + 关键标签，适合快速浏览',
    component: CompactCardView,
  },
  {
    id: 'compare',
    label: '详细对照',
    description: '把完整属性并排摊开，适合筛选后比较几件装备',
    component: CompareView,
    // 这个视图本身就把 tooltip 全摊开了，"详情"面板没有意义
    showsFullStats: true,
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
