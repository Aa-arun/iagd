import type { IStat } from './stats';

/**
 * 物品自带或触发的技能。
 *
 * 带 `level` 的是物品赋予的技能；`trigger` 非空表示它是"被触发"类
 * （例如"击中时施放"）。
 */
export interface ISkill {
  name: string;
  description: string;
  level?: number;

  petStats: IStat[];
  headerStats: IStat[];
  bodyStats: IStat[];

  trigger?: string | null;
}
