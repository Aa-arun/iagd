import affixTable from './affixes.json';
import type { IReplicaRow } from './item';

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

/** 游戏 tooltip 里"物品名"那几行的 type（在 ReplicaStatList 里被隐藏掉）。 */
const NAME_ROW_TYPES = new Set([3, 4, 5, 6, 7]);

/**
 * 从游戏 tooltip 的名字行里，取出**基底名那一段**用的颜色码。
 *
 * ★ 基底名的颜色**不是固定的**，别写死。同是"稀有（绿）"装备，游戏分两档：
 *   - 普通底材 → 基底名白色（`^w`）
 *   - MI（怪物专属）底材 → 基底名本身就是绿的（`^l`）
 *
 *   实测三件：
 *     ^y磐石(穿酸抗)· ^l海里昂的盾徽 ^g·吉尔达姆秘术(MP/CS/混抗/CDR)   ← MI
 *     ^g幽灵束缚(...)· ^l萨拉查的王者之剑 ^g·崩碎现实(虚混/AS/CS)       ← MI
 *     ^g暴怒(...)· ^w保护者 马裤 ^y·野猪(体格/精神)                     ← 普通底材
 *
 *   而 C# 给的 `item.name` 是**剥掉颜色码的纯文本**，问不出这个信息，
 *   所以只能回到游戏的名字行里，按 `nameCore` 的位置往前找最近的那个代码。
 *
 * @returns 单个字符的颜色码（`'w'` / `'l'` …）；找不到返回 null，由调用方兜底。
 */
function coreColorCode(rows: IReplicaRow[] | undefined, core: string): string | null {
  const row = rows?.find((r) => NAME_ROW_TYPES.has(r.type));
  if (!row) return null;

  const at = row.text.indexOf(core);
  if (at < 0) return null;

  // 取基底名之前**最后一个** `^X` —— 那就是游戏给这一段指定的颜色
  const codes = row.text.slice(0, at).match(/\^[a-zA-Z-]/g);
  return codes && codes.length > 0 ? codes[codes.length - 1][1] : null;
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
  /** 游戏原样导出的 tooltip 行——基底名的**颜色**要从它里面问，见 coreColorCode */
  replicaStats?: IReplicaRow[];
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

  /*
   * ★ 基底名的颜色**照游戏的名字行来**，不要写死。
   *
   *   同为"稀有（绿）"装备，游戏的规矩是看**底材**：
   *     普通底材 → `^w`（白）      例：保护者 马裤
   *     MI（怪物专属）底材 → `^l`（绿） 例：萨拉查的王者之剑、海里昂的盾徽
   *   所以不能一律压白——那会把 MI 装备的绿色基底名也涂成白的。
   *
   *   取不到（比如没有 tooltip 名字行）就按普通底材的白兜底。
   */
  const code = coreColorCode(item.replicaStats, core) ?? 'w';

  return { name: `${prefix ?? ''}^${code}${core}${suffix ?? ''}`, core };
}
