/**
 * 单条属性。
 *
 * C# 侧把一条属性拆成 `text`（带占位符的模板）+ 若干 `paramN`，
 * 前端负责把参数填进模板。例如：
 *
 * ```
 * text   = "+{0}% 攻击速度"
 * param0 = "12"
 * ```
 *
 * 之所以不直接传拼好的字符串：同一个模板可以复用，且前端能按需高亮数值。
 * 现阶段的开发数据服务还没有实现属性翻译（见 .docs/04-开发环境.md §8.4），
 * 所以真实数据里这些数组暂时是空的。
 */
export interface IStat {
  text: string;
  param0: string;
  param1: string;
  param2: string;
  param3: string;
  param4: string;
  param5: string;
  param6: string;
  extras?: string;
}
