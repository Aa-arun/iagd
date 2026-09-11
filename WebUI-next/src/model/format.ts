/**
 * 数字格式化。
 *
 * 两个后端返回的数字形状不同（实测 2026-09-11）：
 *
 * | 字段 | devapi 原型 | C# 后端 |
 * |---|---|---|
 * | `level` | `94` | `75.0`（C# 的 float 序列化） |
 * | `param0` | `"3"`（字符串，已四舍五入） | `3.0`（数字） |
 *
 * 前端统一走这里，免得界面上出现「等级 75.0」这种。
 * `String(Number(75.0))` 在 JS 里就是 `"75"`——数字类型不区分整数/浮点。
 */
export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  const n = Number(value);
  // 非数字（理论上不该出现）原样返回，便于发现问题而不是显示 NaN
  return Number.isFinite(n) ? String(n) : String(value);
}
