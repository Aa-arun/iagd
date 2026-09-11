/**
 * 品质 → CSS 类名。
 *
 * 品质值来自数据库的 `Rarity` 字段，取值有
 * `Legendary` / `Epic` / `Blue` / `Rare` / `Magical` / `Common` / `Broken`。
 * 这里统一转成小写的 `quality-xxx` 类，颜色在 ItemCard.css 里定义。
 */
export function qualityClass(quality: string): string {
  return `quality-${quality.toLowerCase()}`;
}
