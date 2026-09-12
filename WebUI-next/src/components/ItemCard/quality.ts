/**
 * 品质 → CSS 类名。
 *
 * ⚠️ 这个字段有**两套叫法**，而且其中一对还是**交叉命名**，实测确认过：
 *
 * | 库里的值 | 实际是什么 | 该用的 class |
 * |---|---|---|
 * | `Green`  | 稀有（绿） | `.quality-rare` |
 * | `Blue`   | 史诗（蓝） | `.quality-epic` |
 * | `Epic`   | **传奇（紫）** | `.quality-legendary` |
 *
 * 最后一行是 IA 上游的历史包袱，别按字面理解 `Epic`：
 * - `Filters/FilterOptionsService.cs` 里 `value = "Epic"` 配的标签是
 *   `iatag_rarity_epic`（默认文本 `"Legendary"`）
 * - `ItemCollectionDaoImpl.cs` 把 `'Legendary' OR 'Epic'` 当同一类处理
 * - 全库 40 件 `Epic` 物品，游戏原样导出的类型行（type 66）全都写"传奇"
 *
 * 之前这里是直接小写拼 `quality-xxx`，于是 `Green` 拼出 `quality-green`
 * （样式表里是 `.quality-rare`，匹配不上 → 名字落回默认灰白），
 * 而 `Epic` 落到 `.quality-epic`（蓝）——**40 件传奇的名字全被画成蓝色**。
 *
 * 颜色本身仍在 `ItemCard.css` 里定义（`--q-*` 变量见 `styles/global.css`）。
 */
const ALIASES: Record<string, string> = {
  white: 'common', // 白 = 普通
  yellow: 'magical', // 黄 = 魔法
  green: 'rare', // 绿 = 稀有
  blue: 'epic', // Blue（IA）= 史诗（蓝）
  epic: 'legendary', // ⚠️ Epic（IA）= 传奇（紫）—— 交叉的，见上面那张表
};

export function qualityClass(quality: string): string {
  const key = (quality || '').toLowerCase();
  const mapped = ALIASES[key] ?? key;
  return `quality-${mapped || 'unknown'}`;
}
