import type { ItemViewProps } from '../types';
import TransferButton from '../../components/TransferButton/TransferButton';
import TooltipCard from '../../components/ItemTooltip/TooltipCard';
import './CompareView.css';

/**
 * 「详细对照」视图：把筛选结果**并排摊开**，一眼比较几件装备的完整属性。
 *
 * 使用者 2026-09-12 要求：原有的大卡片排列方式要作为一种视图，用途是
 * "筛选后并列比较几件不同装备"，排列参考 grimtools 的 item-card——
 * 卡片高度按内容多少，**同一行以最宽的为准**。
 *
 * 实现要点：外层 `display: flex`（`align-items: flex-start`），行高天然取该行
 * 最高的项，而每张卡自己的边框只包自己的条目。不需要 JS 测量高度——那正是
 * flex 布局擅长的，量高度反而会遇到"图片加载完高度才变"的时序问题。
 *
 * ★ 卡片**内容**整个交给 `TooltipCard`（使用者 2026-09-14："item-detail 应该和
 *   compare-card 的样式一样、代码应该复用"）。这里只剩两件本视图自己的事：
 *   网格怎么排、以及抬头右侧那颗「取出」按钮。
 */
export default function CompareView({
  items,
  onItemHover,
  onItemActivate,
  pinnedId,
}: ItemViewProps) {
  return (
    <div className="compare-grid">
      {items.map((item) => {
        const pinned = pinnedId === item.uniqueIdentifier;

        return (
          <article
            key={item.uniqueIdentifier}
            data-item-card
            className={`compare-card${pinned ? ' is-pinned' : ''}`}
            onMouseEnter={(e) => onItemHover?.(item, e.currentTarget)}
            onMouseLeave={() => onItemHover?.(null, null)}
            onClick={(e) => onItemActivate?.(item, e.currentTarget)}
          >
            <TooltipCard item={item} action={<TransferButton item={item} />} lazyIcon />
          </article>
        );
      })}
    </div>
  );
}
