import type { ComponentType } from 'react';
import type IItem from '../model/item';

/**
 * 所有物品视图的统一接口。
 *
 * ★ 架构约束（[`.docs/03-目标架构.md`](../../../.docs/03-目标架构.md) §6.1）：
 * 视图**只接收 `items`**，自己不做数据获取。
 *
 * 这条约束的价值在于：新增一种展示样式 = 新增一个组件 + 在注册表加一行，
 * **完全不动数据逻辑**（分页、排序、转移那些）。视图之间也无法互相影响。
 */
export interface ItemViewProps {
  items: IItem[];
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
}
