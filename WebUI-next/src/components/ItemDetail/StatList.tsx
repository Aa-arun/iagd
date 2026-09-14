import type { IStat } from '../../model/stats';
import { formatNumber } from '../../model/format';

/**
 * 把属性模板里的 `{N}` 换成 `paramN`，并给数值套一个着色的 `<span>`。
 *
 * ★ 这正是 C# 采用「模板 + 参数」而不是在后端拼好字符串的原因：
 * 前端能给**数值单独上样式**（grimtools 的 `.tooltip-param-text` 就是这么做的）。
 */
function renderStat(stat: IStat) {
  // 用捕获组切分，分隔符会保留在结果数组里
  const parts = stat.text.split(/(\{[0-6]\})/g);

  return parts.map((part, index) => {
    const match = /^\{([0-6])\}$/.exec(part);
    if (!match) return part;

    const value = stat[`param${match[1]}` as keyof IStat];
    if (value === undefined || value === '') return null;

    return (
      <span key={index} className="tt-card__value">
        {formatNumber(value)}
      </span>
    );
  });
}

export default function StatList({ stats }: { stats: IStat[] }) {
  if (stats.length === 0) return null;

  return (
    <ul className="tt-card__stats">
      {stats.map((stat, index) => (
        // 属性没有稳定 id，且顺序固定，用下标作 key 是安全的
        <li key={index}>{renderStat(stat)}</li>
      ))}
    </ul>
  );
}
