import type { ReactNode } from 'react';
import type { IReplicaRow } from '../../model/item';

/**
 * 渲染**游戏原样导出的** tooltip 行（`replicaStats`）。
 *
 * ★ 为什么用它而不是 `headerStats`/`bodyStats`：
 *   游戏已经把这件装备的完整 tooltip 原样给了我们（`ItemReplica` 导出、IA 存进库），
 *   带 `^X` 颜色代码、顺序与文案都与游戏内一致。从 `DatabaseItemStat` 重新拼一套
 *   既费劲又不可能对齐（转换行、套装、授予技能那一大堆）。
 *   所以「详情接近游戏效果」这条路上，它是最短的路径。
 *
 * 渲染规则（2026-09-12 按使用者要求调整）：
 * - `^X` → CSS 类 `tt-X`，颜色在 `ReplicaStatList.css` 里按**伤害/抗性类型**分色
 * - `^s` 段（英文技能名，如 `(Black Death)`）→ **隐藏**，使用者不要英文
 * - 职业标记（`^g<^F神秘^g>`）→ 统一颜色，**不按人物职业变色**
 *   （游戏里会灰掉非本职业的技能，但库里每个人物不同，那样没意义）
 * - `^r`（"需要 玩家等级/灵巧/精神/体格"）→ 普通色，**不跟人物属性联动**
 * - 行的 `type` → CSS 类 `tt-type-N`，决定这一行是标题、套装、授予技能还是普通属性
 */

/** 行首的英文技能名：`阿玛拉斯塔的爆裂之刃 (Amarasta's Blade Burst) 技能等级 +2`。 */
const ENGLISH_SKILL_NAME = / \(([A-Za-z][A-Za-z'’\- ]{3,})\)/g;

/**
 * 有些行是**旧格式**：没有 `^X` 代码，英文名也没被 `^s` 包起来（实测 `type=81`）。
 * 只在这种"技能等级"行上删英文括号——普通属性里的 `(OA)` `(DA)` `(CDR)`
 * 是缩写，必须留着，所以不能无差别删括号。
 */
function stripEnglishSkillName(text: string): string {
  if (text.includes('^') || !text.includes('技能等级')) {
    return text;
  }

  return text.replace(ENGLISH_SKILL_NAME, '');
}

/**
 * 技能行里会被复用的颜色代码。
 *
 * ⚠️ 同一个代码在不同语境下**语义不同**：`^F` 在属性行是"活力伤害"（桃红），
 * 在技能行却是职业名（`^g<^F神秘^g>^c黑死病` 里的"神秘"）。而使用者要求
 * 技能与职业名**统一颜色**（游戏里会按人物职业灰掉非本职技能，但库里没有
 * "当前人物"这个概念）。所以这几行要按行判断，不能光靠 CSS。
 */
const SKILL_ROW_CODES = new Set(['g', 'c', 'F', 'L']);

/** 这一行是不是"技能"相关（+N 技能等级 / 职业技能标记）。 */
function isSkillRow(text: string, type: number): boolean {
  if (text.includes('技能等级') || text.includes('^g<')) {
    return true;
  }

  return type === 12 || type === 13 || type === 14 || type === 16 || type === 49 || type === 51 || type === 52;
}

/**
 * 把一行带 `^X` 代码的文本切成若干 `<span>`。
 *
 * ⚠️ 刻意**不用** `dangerouslySetInnerHTML`（旧前端是那么干的）：拼 HTML 字符串
 * 再插进 DOM，等于把数据库里的文本当代码执行。这里切成 React 元素，文本永远
 * 只是文本。
 */
export function parseRow(text: string, skillRow = false): ReactNode[] {
  const parts: ReactNode[] = [];
  let className = '';
  let buffer = '';
  let key = 0;

  const flush = () => {
    if (buffer) {
      parts.push(
        <span key={key++} className={className || undefined}>
          {buffer}
        </span>,
      );
      buffer = '';
    }
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

/** 空行大多是游戏用来分段的分隔符，渲染成一点空白即可。 */
function isSeparator(row: IReplicaRow): boolean {
  return row.text.trim().length === 0;
}

interface Props {
  rows: IReplicaRow[];
}

export default function ReplicaStatList({ rows }: Props) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="tt">
      {rows.map((row, index) => {
        if (isSeparator(row)) {
          return <p key={index} className="tt-gap" />;
        }

        const text = stripEnglishSkillName(row.text);
        const skillRow = isSkillRow(text, row.type);

        return (
          <p key={index} className={`tt-type-${row.type}`}>
            {parseRow(text, skillRow)}
          </p>
        );
      })}
    </div>
  );
}
