import { TABLE } from './statColors.table';

/**
 * 属性关键词 → 颜色码。**这是本软件显示 tooltip 颜色的唯一标准。**
 *
 * ★ 立场（使用者 2026-09-13 定）：
 *   **不管玩家装了哪份汉化包、把它改成了什么颜色，到我们这儿一律以本表为准。**
 *   渲染前会用它**覆盖**属性行里原有的 `^X` 码——统一观感比"跟游戏一模一样"更重要。
 *
 * ★ 表在 `statColors.table.ts`，**我们自己的颜色风格表，手工维护**——
 *   要加词、改色直接改那边。它最初从工程自带的汉化包 `gd-tags-ui.zh.txt`
 *   （B站 up 主「发光的洛伦兹」那份，只作参考来源）整理而来，判据见该文件注释。
 *
 * ★ **作用范围**由 `ReplicaStatList.tsx` 的 `RECOLOR_TYPES` 决定：
 *   只碰"属性内容行"，名字 / 说明 / 标题一律不动。
 *   （否则 `…(造成暴击时有 30% 的几率…)` 里的"暴击"、套装说明里的"生命"
 *   都会被误染——使用者 2026-09-13 报过。）
 *
 * ★ 非属性语义码一律不动：`^s` 英文名、`^c` 技能名、`^g`/`^F` 职业标记、
 *   `^w` 名字白、`^r` 需求——它们不在"属性词"的管辖范围内。
 */

/** 运行时按**词长降序**排：必须先试长词，否则"生命"会抢先命中"生命回复"的前两个字。 */
const ORDERED: [string, string][] = Object.entries(TABLE).sort((a, b) => b[0].length - a[0].length);

/** 给一段文本里**我们认识的属性词**重新着色；其余原样保留。 */
function recolorSegment(segment: string, current: string): string {
  let out = '';
  let i = 0;

  while (i < segment.length) {
    const hit = ORDERED.find(([word]) => segment.startsWith(word, i));
    if (!hit) {
      out += segment[i];
      i += 1;
      continue;
    }

    const [word, code] = hit;
    if (current === code) {
      // 原本就是这个色（汉化包配对了）→ 不加码，免得堆出一串多余的 span
      out += word;
    } else {
      // `^-` 让这个词之后回到默认色，不把颜色漏给后面的文字
      out += `^${code}${word}^-`;
    }
    i += word.length;
  }

  return out;
}

/**
 * 按本表重新着色一行 tooltip 文本。
 *
 * 例：
 *   `^H+39 ^H防御能力(DA)`  →  `^H+39 ^E防御能力^-(DA)`
 *        （"防御能力"在我们表里是 `^E`；数值 `+39` 仍是游戏给的 `^H` 金）
 *   `^O活力伤害`            →  `^F活力伤害`（本表以 `^F` 为准）
 *   `+120% 酸性伤害`        →  `+120% ^G酸性伤害^-`（原本无码，补上）
 */
export function recolorStats(text: string): string {
  const tokens = text.split(/(\^[A-Za-z-])/).filter((t) => t !== '');
  let out = '';
  /** 当前生效的颜色码；空串 = 默认（没被任何码罩着） */
  let code = '';

  for (const token of tokens) {
    if (token.length === 2 && token[0] === '^') {
      code = token[1] === '-' ? '' : token[1];
      out += token;
      continue;
    }
    out += recolorSegment(token, code);
  }

  /*
   * 收尾：**连续的颜色码只有最后一个生效**，把冗余的合并掉。
   *
   * 覆盖时必然产生这种串——原文 `^F混乱伤害`，我们表里"混乱伤害"是 `^O`，
   * 于是变成 `^F^O混乱伤害^-^-`。渲染结果虽然对（`^O` 立刻盖住 `^F`），
   * 但 DOM 里白多两层 span，读起来也乱。
   * 注意码之间**有文本**的情况不受影响（如 `^g<^F神秘^g>` 里的 `<`）。
   */
  return out.replace(/(?:\^[A-Za-z-])+/g, (run) => run.slice(-2));
}

/** 表里有多少条（排查用）。 */
export const STAT_COLOR_ENTRY_COUNT = ORDERED.length;
