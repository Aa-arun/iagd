import type { ComponentType } from 'react';
import type IItem from '../model/item';

/**
 * 所有物品视图的统一接口。
 *
 * ★ 架构约束（[`.docs/03-目标架构.md`](../../../.docs/03-目标架构.md) §6.1）：
 * 视图**只接收 `items` 与回调**，自己不做数据获取，也不自己管详情面板。
 *
 * 这条约束的价值：新增一种展示样式 = 新增组件 + 注册一行，
 * **完全不动数据逻辑**；而 hover/点击详情这类交互对所有视图是同一套。
 */
export interface ItemViewProps {
  items: IItem[];

  /** 悬停某件物品；`null` 表示移开。`element` 用于定位详情面板。 */
  onItemHover?: (item: IItem | null, element: HTMLElement | null) => void;
  /** 点击某件物品：固定 / 取消固定详情面板 */
  onItemActivate?: (item: IItem) => void;
  /** 当前已固定的物品 id，供视图做高亮 */
  pinnedId?: string | null;
}

/** 注册表里的一项。 */
export interface ItemViewDefinition {
  /**
   * 稳定 id，用于保存用户偏好。
   * **不要修改已有 id**——改了会让用户已保存的偏好失效。
   */
  id: string;
  /** 选择框里显示的名字 */
  label: string;
  /** 一句话说明，作为悬停提示 */
  description: string;
  component: ComponentType<ItemViewProps>;

  /**
   * 这种视图是不是**自己就把完整属性摊开了**。
   *
   * ★ 是的话，"详情"面板就没有意义了——它展示的东西视图里本来就有。
   *   工具栏会把"详情"下拉禁用，布局也不再为它留侧栏。
   *
   * 用注册表里的标志而不是在工具栏里硬编码 `viewId === 'compare'`：
   * 将来再加同类视图（比如"全屏对照"），只要打这个标志就自动生效。
   */
  showsFullStats?: boolean;
}
