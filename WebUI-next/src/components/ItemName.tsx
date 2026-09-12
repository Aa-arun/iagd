import type IItem from '../model/item';
import { composeItemName } from '../model/affixes';
import { parseRow } from './ItemDetail/ReplicaStatList';

/**
 * 渲染物品名：**前缀 + 基础名 + 后缀**，颜色代码解析成 span。
 *
 * ★ 名字由前端组装（`composeItemName`），不是直接用 C# 拼好的 `item.name`
 *   ——因为词缀的显示文本由我们自己的词缀表决定，见 model/affixes.ts。
 *
 * 颜色由容器决定：未被 `^X` 覆盖的部分**继承父元素的颜色**，所以把本组件
 * 放在带 `qualityClass(...)` 的元素里，基础名就自动是稀有度色，而词缀是
 * 词缀自己的颜色（`^y` 魔法黄 / `^g` 稀有绿）。
 */
export default function ItemName({ item }: { item: IItem }) {
  return <>{parseRow(composeItemName(item).name)}</>;
}
