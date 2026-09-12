import affixTable from './affixes.json';

/**
 * 词缀表（前缀/后缀）——**我们自己维护的**，不依赖游戏当前用的汉化包。
 *
 * ★ 为什么需要：`item.name` 是 C# 用**游戏当时那套汉化包**拼出来的。换一套
 *   汉化包（或原版没装汉化）词缀就不一样，颜色与"推荐标记 ☆"更是只有特定
 *   汉化包才有。使用者 2026-09-12 要求把这些固定下来，所以把词缀提取成这份
 *   数据，由前端组装名字。
 *
 * 数据来源：使用者提供的汉化包 `tags_items.txt` 的前缀/后缀两段
 * （385 条；其中 `^y` 普通词缀 129 条、`^g` 稀有词缀 256 条、
 * 带推荐标记 `☆` 的 100 条）。文本里保留了颜色代码与 `☆`。
 *
 * ⚠️ 这是**静态数据**：游戏加了新词缀就要重新提取一次。
 *    `item.prefixTag` / `item.suffixTag`（由 C# 提供）是查表的键。
 */
const TABLE = affixTable as Record<string, string>;

/** 查一条词缀的显示文本（含 `^X` 颜色代码与 `☆`）。没有就返回 null。 */
export function affixText(tag?: string | null): string | null {
  if (!tag) return null;
  return TABLE[tag] ?? null;
}

/** 这个词缀是不是"推荐"的（汉化包用 ☆ 标记）。 */
export function isRecommendedAffix(tag?: string | null): boolean {
  const text = affixText(tag);
  return !!text && text.includes('☆');
}

interface NameParts {
  /** 完整名字，含颜色代码 */
  name: string;
  /** 纯基础名（没有前后缀时等于 name） */
  core: string;
}

/**
 * 组装物品名：`前缀 + 基础名 + 后缀`。
 *
 * 例：`^g恒定☆·` + `保护者 胸铠` + `^y·雄鹰☆` → `恒定☆·保护者 胸铠·雄鹰☆`
 * （前缀绿、名字按稀有度、后缀黄——颜色由 `parseRow` + CSS 处理）。
 *
 * 查不到词缀时**退回 C# 拼好的名字**（`item.name`），所以即使我们没有那条
 * 词缀的数据，显示也不会变成空白。
 */
export function composeItemName(item: {
  name: string;
  nameCore?: string;
  prefixTag?: string;
  suffixTag?: string;
}): NameParts {
  const prefix = affixText(item.prefixTag);
  const suffix = affixText(item.suffixTag);

  // ★ 只要**有一侧**的词缀我们查不到，就整体回退到 C# 拼好的名字。
  //   宁可两个词缀都用游戏文本，也不要显示成"只换了一半"的半成品。
  if ((item.prefixTag && !prefix) || (item.suffixTag && !suffix)) {
    return { name: item.name, core: item.name };
  }

  if (!prefix && !suffix) {
    return { name: item.name, core: item.name };
  }

  const core = item.nameCore || item.name;
  return { name: `${prefix ?? ''}${core}${suffix ?? ''}`, core };
}
