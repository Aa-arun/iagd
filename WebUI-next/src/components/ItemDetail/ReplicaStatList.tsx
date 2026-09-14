import type { ReactNode } from 'react';
import type { IReplicaRow } from '../../model/item';
import { recolorStats } from '../../model/statColors';

/**
 * 渲染**游戏原样导出的** tooltip 行（`replicaStats`）。
 *
 * 为什么用它而不是 `headerStats` / `bodyStats`：游戏已经把完整 tooltip 给了我们
 * （`ItemReplica` 导出、IA 存进库），带 `^X` 颜色码、顺序与文案都与游戏内一致。
 * 自己从 `DatabaseItemStat` 重拼一套既费劲，也不可能对齐（转换行、套装、
 * 授予技能那一大堆）。
 *
 * 四条约定：
 * 1. `^X` → CSS 类 `tt-X`；每行另外带 `tt-type-N`（行种）与 `tt-indent-N`
 *    （缩进级别）。颜色全在 `ReplicaStatList.css` 里。
 * 2. `^s` 段是英文技能名 → **隐藏**（不需要英文）。
 * 3. 职业名按职业分色（`--cls-*`，见 `styles/global.css`）。**不按人物职业**：
 *    库里的 tooltip 是不同角色、不同时期导出的，照搬游戏会让同一件装备在
 *    不同人眼里长得不一样。
 * 4. `^r`（"需要 玩家等级/灵巧/精神/体格"）用普通色，不跟人物属性联动。
 *
 * 下面按三段组织：文本规范化 → 职业识别 → 着色与缩进。
 */

// ── 文本规范化 ───────────────────────────────────────────────────────
//
// 游戏导出的行有几种"缺东西"的形态，渲染前先补成一种：完全没有颜色码、
// 职业名外面没有尖括号、英文名没被 `^s` 包起来。

/** 行首的英文技能名：`阿玛拉斯塔的爆裂之刃 (Amarasta's Blade Burst) 技能等级 +2`。 */
const ENGLISH_SKILL_NAME = / \(([A-Za-z][A-Za-z'’\- ]{3,})\)/g;

/**
 * 删掉英文技能名。
 *
 * 只对**没有颜色码、且含"技能等级"的行**动手——普通属性里的 `(OA)` `(DA)`
 * `(CDR)` 是缩写，必须留着，所以不能无差别删括号。
 */
function stripEnglishSkillName(text: string): string {
  if (text.includes('^') || !text.includes('技能等级')) {
    return text;
  }
  return text.replace(ENGLISH_SKILL_NAME, '');
}

/**
 * 完全没有颜色码的两种行，按固定形状补上颜色码。
 *
 * ★ 为什么会有"没有颜色码"的行：游戏导出 tooltip 时会**按角色当时的职业**
 *   突出相关条目——与本职业相符的带颜色码，其余不带。库里的 tooltip 出自
 *   不同角色，所以同一件装备上两种都会出现；补齐后显示就与角色无关了。
 *
 * ⚠️ 两种条目的形状不同，别混：
 *   · 技能等级：`<萨满>野性 技能等级 +3` ——`<职业>` 是**汉化包**给"技能"加的
 *     职业补丁，**紧贴**技能名（不留空格）。
 *   · 所有技能：`审判官 所有技能 +1` —— 游戏原版写法，**不带尖括号**，
 *     职业名后面**有**空格。
 */
const PLAIN_SKILL_ROW = /^<([^>]+)>(.+?)\s*\(([^)]*)\)\s*技能等级\s*\+(\d+)\s*$/;
const PLAIN_ALL_SKILLS = /^(\S+)\s+所有技能\s+\+(\d+)\s*$/;

function colorizePlainSkillRow(text: string): string {
  const skill = text.match(PLAIN_SKILL_ROW);
  if (skill) {
    const [, cls, name, english, level] = skill;
    return `^g<^F${cls}^g>^c${name} ^s(${english}) ^E技能等级 ^H+${level}`;
  }

  const all = text.match(PLAIN_ALL_SKILLS);
  if (all) {
    const [, cls, level] = all;
    return `^F${cls} ^c所有技能 ^H+${level}`;
  }

  return text;
}

/**
 * 给**没有尖括号**的职业名补上，统一写法。
 *
 * 只处理"技能等级"那类；"所有技能"条目本来就不带尖括号，直接跳过。
 * 认不出（或已经带尖括号）就原样返回——宁可不着色，也不改坏文本。
 */
function normalizeBareClassMark(text: string): string {
  if (text.includes('<') || text.includes('所有技能')) return text;

  for (const name of Object.keys(CLASS_CLASS)) {
    // 只认"紧跟颜色码、后面是空白或行尾"的职业名，不会误伤正文里的同名词
    const pattern = new RegExp(`\\^[A-Za-z]${name}(?=\\s|$)`);
    if (pattern.test(text)) {
      return text.replace(pattern, `^g<^F${name}^g>`);
    }
  }
  return text;
}

// ── 职业识别 ─────────────────────────────────────────────────────────

/**
 * 十个职业，以及它们在 tooltip 里出现过的**所有写法**。
 *
 * ★ 一个职业会有两个名字，取决于条目类型：
 *   尖括号里（`<守誓>`）用**短名**，不带尖括号时（`^L神秘学者`）有的用**全名**。
 *   （短名来自库数据的实测，全名来自游戏内的职业列表。）
 */
const CLASS_NAMES: { cls: string; names: string[] }[] = [
  { cls: 'tt-cls-soldier', names: ['士兵'] }, // 短名 = 全名
  { cls: 'tt-cls-demolitionist', names: ['爆破', '爆破者'] },
  { cls: 'tt-cls-occultist', names: ['神秘', '神秘学者'] },
  { cls: 'tt-cls-nightblade', names: ['夜刃'] }, // 短名 = 全名
  { cls: 'tt-cls-arcanist', names: ['奥术'] }, // 短名 = 全名
  { cls: 'tt-cls-shaman', names: ['萨满'] }, // 短名 = 全名
  { cls: 'tt-cls-inquisitor', names: ['审判', '审判官'] },
  { cls: 'tt-cls-necromancer', names: ['死灵', '死灵法师'] },
  { cls: 'tt-cls-oathkeeper', names: ['守誓', '守誓者'] },
  { cls: 'tt-cls-berserker', names: ['狂战', '狂战士'] },
];

/** 名字 → 类名。 */
const CLASS_CLASS: Record<string, string> = Object.fromEntries(
  CLASS_NAMES.flatMap(({ cls, names }) => names.map((name) => [name, cls])),
);

/**
 * 按名字找职业：精确优先，其次"包含"（认得 `死灵法师` 这种全名）。
 *
 * ⚠️ 长度上限 6 个字：否则传进一整行文本时，行里随便出现一个职业名就会被
 *    误判成"这行是那个职业的"。
 */
function matchClassName(text: string): string | undefined {
  if (CLASS_CLASS[text]) return CLASS_CLASS[text];
  if (text.length > 6) return undefined;

  for (const name of Object.keys(CLASS_CLASS)) {
    if (text.includes(name)) return CLASS_CLASS[name];
  }
  return undefined;
}

/**
 * 这一行提到的是哪个职业（没有就是 undefined）。
 *
 * 两种写法都认：`^g<^F神秘^g>…`（职业名在尖括号里）和 `^L萨满 ^E所有技能…`
 * （没有尖括号，职业名直接跟在颜色码后面）。匹配前先剥掉颜色码。
 */
function findLineClass(text: string): string | undefined {
  const plain = text.replace(/\^[a-zA-Z-]/g, '');

  const inBracket = plain.match(/<([^>]+)>/)?.[1];
  if (inBracket) {
    const byBracket = matchClassName(inBracket);
    if (byBracket) return byBracket;
  }

  for (const name of Object.keys(CLASS_CLASS)) {
    if (plain.includes(name)) return CLASS_CLASS[name];
  }
  return undefined;
}

// ── 着色 ─────────────────────────────────────────────────────────────

/**
 * 技能行里会被"统一色"接管的颜色代码。
 *
 * ⚠️ 同一个代码在不同语境下语义不同：`^F` 在属性行是"活力伤害"（桃红），
 *    在技能行却是职业名。所以只能按行判断，不能光靠 CSS。
 *
 * ⚠️ 技能名 `^c` **不在**这里——它按使用者要求用 `--tt-value`（属性数值那种黄），
 *    由 `.tt-c` 定义。
 */
const SKILL_ROW_CODES = new Set(['g', 'F', 'L']);

/** 这一行是不是"技能"相关（+N 技能等级 / 职业技能标记）。 */
function isSkillRow(text: string, type: number): boolean {
  if (text.includes('技能等级') || text.includes('^g<')) {
    return true;
  }
  return type === 12 || type === 13 || type === 14 || type === 16 || type === 49 || type === 51 || type === 52;
}

/**
 * `type 82` 这一行是"技能名 / 技能说明 / 技能参数"里的哪一种（都不是就返回 `null`）。
 *
 * ★ 为什么需要它（使用者 2026-09-13 报的 bug）：
 *   **普通**授予技能区里，技能名是 `type 37`（蓝色）、说明是 `type 39`（灰色）、
 *   参数是 `type 81/82/83`（米黄）——各自有 CSS。
 *   但**套装授予技能**整块都是 `type 82`（游戏就是这么导出的），于是
 *   "自然复仇者"这个名字和"复仇者的精神在你体内膨胀。"这句说明
 *   都被按"技能参数"渲染成了米黄。
 *
 * 判定只看文本形状（用「复仇粉碎者」「伊斯坎德拉的文本」两块真实数据核对过）：
 *   - 以句号结尾、且不含数值色 `^H` → **技能说明**
 *   - 带 `(…施放该技能)` 这种括号、或带 `<职业>` 标记 → **技能名**
 *   - 其余（`12 秒技能冷却时间`、`75% 的武器伤害`、`+70 度攻击范围`…）→ 参数
 */
function skillRowKind(text: string): 'name' | 'desc' | null {
  const plain = text.replace(/\^[a-zA-Z-]/g, '').trim();

  if (plain.endsWith('。') || plain.endsWith('.')) return 'desc';
  if (plain.includes('施放该技能')) return 'name';

  /*
   * 技能名的第二种形态：`<职业>技能名`。判定要求职业标记在**行首**。
   *
   * ⚠️ 不能只看"行里含 `<…>`"（使用者 2026-09-14 报的误判）：
   *   `造成暴击时有 25% 几率触发<爆破>手榴弹 (Grenado) 冷却时间减少 2 秒`
   *   也含职业标记，但它是**参数行**（触发效果），被错判成技能名后
   *   颜色/字重都跟着技能名走，和同一块里的其它参数不一致。
   *   纯技能名（`^g<守誓>重击`）去掉颜色码后**以 `<` 开头**，这条能区分开。
   */
  if (plain.trimStart().startsWith('<')) return 'name';

  /*
   * ★ 第三种形态：**干干净净的一行纯中文**——一个颜色码、一个数字都没有。
   *   `命运封印`、`自然复仇者` 就是这种。使用者 2026-09-14 报的
   *   「复仇之拳 → 命运封印没被识别成技能名」。
   *
   *   为什么敢这么判：参数行**几乎总带数字或颜色码**
   *   （`5 ^E秒^E技能冷却时间`、`+8% ^H攻击能力(OA)`、`最多作用目标 +2`），
   *   说明行以句号结尾（上面已经接走了）。
   */
  if (!text.includes('^') && !/\d/.test(plain) && plain.length <= 12) return 'name';

  return null;
}

/**
 * 把一行带 `^X` 代码的文本切成若干 `<span>`。
 *
 * ⚠️ 刻意**不用** `dangerouslySetInnerHTML`（旧前端那么干过）：拼 HTML 字符串
 * 再插进 DOM，等于把数据库里的文本当代码执行。这里切成 React 元素，文本永远
 * 只是文本。
 */
export function parseRow(text: string, skillRow = false): ReactNode[] {
  const parts: ReactNode[] = [];
  let className = '';
  let buffer = '';
  let key = 0;

  // 整行的职业。得先算：尖括号 `<` 在职业名**前头**，轮到它时还不知道属于谁
  const lineClass = findLineClass(text);

  const flush = () => {
    if (!buffer) return;
    const bare = buffer.trim();

    /*
     * 着色优先级：
     *   1. 职业名本身（`神秘` / `神秘学者`）→ 按职业分色
     *   2. 尖括号（`<` / `>`）→ 跟着整行的职业色，与职业名连成一体
     *   3. "所有技能" → 固定 `tt-c`（`--tt-value`），与技能名同色。
     *      不论原文写 `^c` 还是 `^E`，都归到这一档
     *   4. 其余 → 用它自己那段的颜色码（技能名 `^c`、`技能等级` `^E` …）
     */
    let cls = className;
    const byName = matchClassName(bare);
    if (byName) cls = byName;
    else if ((bare === '<' || bare === '>') && lineClass) cls = lineClass;
    else if (bare === '所有技能') cls = 'tt-c';

    parts.push(
      <span key={key++} className={cls || undefined}>
        {buffer}
      </span>,
    );
    buffer = '';
  };

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '^' && i + 1 < text.length) {
      flush();
      // `^-` 是"恢复默认颜色"，其余是一色一个字母
      const code = text[i + 1];
      if (code === '-') {
        className = '';
      } else if (skillRow && SKILL_ROW_CODES.has(code)) {
        className = 'tt-skill';
      } else {
        className = `tt-${code}`;
      }
      i++;
      continue;
    }

    buffer += text[i];
  }

  flush();
  return parts;
}

// ── 缩进 ─────────────────────────────────────────────────────────────

/*
 * 三级缩进，层级由使用者对着游戏定过（以「复仇粉碎者」为样例）：
 *   0 级  物品类型、武器基础数值、每秒攻击、需求行、套装名、段标题
 *   1 级  普通属性行、技能名、套装成员与说明、授予技能的抬头
 *   2 级  技能下辖的属性、套装加成、授予技能的参数
 */

/** 0 级：与物品主体齐平。 */
const LEVEL0 = new Set([
  17, // 背景说明（"邪术领域天神的号角。"）
  18, // 武器 / 护甲的基础数值
  20, // 每秒攻击，以及"需要 玩家等级/体格"这类需求行
  21, // 套装名
  24, 25, 34, 36, 65, 67, 68, 70, // 各种段标题（授予技能 / 所有战宠加成 / …）
  66, // 物品类型（"传奇双手锤"）
]);

/** 2 级：技能下辖的属性、套装加成、授予技能的参数。 */
const LEVEL2 = new Set([
  26, // 技能下辖的属性
  28, // 套装加成
  33, 42, 55, 69, 71, // 组件 / 战宠下属的属性
  83, // 授予技能的参数
]);

/**
 * 算出每一行该缩进几级。
 *
 * ★ 为什么不逐行只看 type：`type 82` 里混着两种东西，层级差一级——
 *     `+70 度攻击范围`          → 技能**参数**（2 级）
 *     `自然复仇者(受到攻击时…)`  → **技能名**（1 级）
 *   只能看上下文：紧跟在一个"授予技能抬头"（`type 81`）后面的 82 才是参数。
 *   空行、段标题、类型行都会重置这个状态。
 */
function indentLevels(rows: IReplicaRow[]): (0 | 1 | 2)[] {
  const levels: (0 | 1 | 2)[] = [];
  /** 上一行是不是"授予技能抬头"，是的话接下来的 82 就是它的参数 */
  let afterSkillHeader = false;

  for (const row of rows) {
    if (row.text.trim().length === 0) {
      afterSkillHeader = false;
      levels.push(0);
      continue;
    }

    let level: 0 | 1 | 2;

    if (LEVEL0.has(row.type)) {
      afterSkillHeader = false;
      level = 0;
    } else if (row.type === 81) {
      afterSkillHeader = true;
      level = 1;
    } else if (row.type === 82) {
      /*
       * 紧跟"授予技能"抬头（81）的 82 是它的参数（2 级）。
       * ★ 套装授予技能**没有抬头**，整块都是 82——那种情况用文本形状兜底：
       *   名字 / 说明 → 1 级，参数（`12 秒技能冷却时间`）→ 2 级。
       */
      level = afterSkillHeader || skillRowKind(row.text) === null ? 2 : 1;
    } else if (LEVEL2.has(row.type)) {
      level = 2;
    } else {
      // 其余都是 1 级：普通属性 19、技能名 37/38、技能描述 39/40、
      // 套装说明 22 与成员 23、"+N 到某技能" 79…
      afterSkillHeader = false;
      level = 1;
    }

    levels.push(level);
  }

  return levels;
}

/**
 * 只有**这些行种**才按我们自己的表重新着色（`recolorStats`）。
 *
 * ⚠️ 使用者 2026-09-13 报的两个误伤，都是"一刀切"造成的：
 *   · `type 37`（技能名）`伊斯坎德拉的元素撕裂(造成暴击时有 30% 的几率施放该技能)`
 *     —— 这里的"暴击"是**描述短语**，不是属性，却被染成了金色；
 *   · `type 22`（套装说明）`…万用对戒，生命恢复（神话级与普通的混搭不能取得套装效果）`
 *     —— 说明文字里的"生命"被染成了桃红。
 *
 * 所以范围**按行种**收窄，只碰"属性内容行"。其余一律不动：物品名 7、类型 66、
 * flavor 16/17、套装名 21、**套装说明 22**、成员与层级 23、段标题 24/25/34/36/65/67/68/70、
 * **技能名 37/38/53**、技能描述 39/40、授予技能抬头 81、以及 `type 82` 的名字与说明。
 *
 * `type 82` 要再分一次：它同时装着"技能名 / 说明 / 参数"，靠 `skillRowKind()` 判断——
 * **只有参数行**才重新着色。
 */
const RECOLOR_TYPES = new Set([
  18, // 武器 / 护甲的基础数值（"148-776 ^E物理伤害^-"）
  19, // 普通属性行
  20, // 每秒攻击、以及"需要 玩家等级 / 体格"这类需求行
  26, // 技能下辖的属性
  28, // 套装加成
  33, 42, 55, 69, 71, // 组件 / 战宠下属的属性
  79, // "+2 到某技能"
  83, // 授予技能的参数
]);

/** 空行大多是游戏用来分段的分隔符，渲染成一点空白即可。 */
function isSeparator(row: IReplicaRow): boolean {
  return row.text.trim().length === 0;
}

// ── 组件 ─────────────────────────────────────────────────────────────

interface Props {
  rows: IReplicaRow[];
}

export default function ReplicaStatList({ rows }: Props) {
  if (!rows || rows.length === 0) return null;

  // 缩进要看上下文（见 indentLevels），所以整表先算一遍再渲染
  const levels = indentLevels(rows);

  return (
    <div className="tt">
      {rows.map((row, index) => {
        if (isSeparator(row)) {
          return <p key={index} className="tt-gap" />;
        }

        // ── 三步，顺序不能乱 ──────────────────────────────────────────
        //
        // ① 给"没有颜色码的技能行"补上**语义码**（职业标记 / 技能名 / 英文名 /
        //    "技能等级"…）——见 `colorizePlainSkillRow`。
        // ② 补职业尖括号、删英文技能名。
        // ③ **只对属性内容行**（`RECOLOR_TYPES` + `type 82` 的参数行）按我们自己的表
        //    重新着色：属性词一律以本表为准，**覆盖**游戏/汉化包给的码。
        //    名字 / 说明 / 标题一律不碰——见 `RECOLOR_TYPES` 的注释。
        const kind = row.type === 82 ? skillRowKind(row.text) : null;
        const base = colorizePlainSkillRow(row.text);
        const withSemantics = stripEnglishSkillName(normalizeBareClassMark(base));

        const isStatRow =
          row.type === 82 ? kind === null : RECOLOR_TYPES.has(row.type);
        const text = isStatRow ? recolorStats(withSemantics) : withSemantics;

        /*
         * ⚠️ 套装加成行**不走"技能行统一色"**：那套逻辑会把 `^F` / `^G` / `^L`
         * 换成技能蓝（因为同一个码在技能行里另有含义），而这里它们是
         * 混乱 / 酸性 / 元素的属性色。
         */
        const skillRow = row.type === 28 ? false : isSkillRow(text, row.type);

        /*
         * 套装授予技能（`type 82`）里的名字与说明，单独给一个类把它们
         * 从"技能参数"的米黄里拉出来，回到普通授予技能那套色（见 CSS）。
         */
        const className = [
          `tt-type-${row.type}`,
          `tt-indent-${levels[index]}`,
          kind === 'name' ? 'tt-skill-name' : '',
          kind === 'desc' ? 'tt-skill-desc' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <p key={index} className={className}>
            {parseRow(text, skillRow)}
          </p>
        );
      })}
    </div>
  );
}
