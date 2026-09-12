/**
 * 数字格式化，以及「一批最多能拿多少条」这类**展示层的适配**。
 *
 * ★ 为什么这些不放 `api/types.ts`：那边是通信协议的**形状**描述，
 *   而这里两个常量/函数都是取数与显示用的，消费者都在展示层
 *   （`App.tsx` 分批取数、`AppShell.tsx` 显示总数）。
 */

/**
 * 后端单次请求最多返回多少条。
 *
 * ★ 来自 C# 的 `PlayerItemDaoImpl.MaxSearchResults = 1000`（SQL 里写的是 `LIMIT 1001`，
 *   多取一行只是为了判断"有没有被截断"）。
 *
 * ⚠️ 超出它不会报错、也不会告诉你"只给了一部分"——**只是少给**。所以想要第 1001 条
 *    必须自己接着发第二次请求（见 `App.tsx` 的 `fetchRange`）。
 */
export const MAX_ITEMS_PER_REQUEST = 1000;

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

/**
 * 物品**总数**的显示文本。
 *
 * 为什么要单独一个函数：后端在"匹配数超过它单次能返回的上限（1000）"时，
 * 会把 `total` 填成哨兵值 `-1`（含义是"至少这么多，具体没算"）。
 * 直接显示会变成「共 -1 件」——所以这里把负值一律写成 `1000+`。
 *
 * 2026-09-12 实测使用者库里只有 66 件，暂时走不到这个分支；
 * 但物品会随游戏时间积累过千，所以现在就把它处理掉。
 */
export function formatTotal(total: number): string {
  return total < 0 ? `${MAX_ITEMS_PER_REQUEST}+` : String(total);
}

/**
 * 「第 from – 第 to 件」这种区间文案，两头都是**从 1 开始**的序号。
 * 空列表返回空串（调用方会走另一条分支）。
 */
export function formatRange(from: number, count: number): string {
  return count <= 0 ? '' : `${from}–${from + count - 1}`;
}
