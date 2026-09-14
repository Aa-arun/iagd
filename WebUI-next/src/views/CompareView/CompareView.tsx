import { useEffect, useRef } from 'react';
import type { ItemViewProps } from '../types';
import TransferButton from '../../components/TransferButton/TransferButton';
import TooltipCard from '../../components/ItemTooltip/TooltipCard';
import { useItemDetail } from '../../components/ItemDetail';
import './CompareView.css';

/**
 * 「详细对照」视图：把筛选结果**并排摊开**，一眼比较几件装备的完整属性。
 *
 * 使用者 2026-09-12 要求：原有的大卡片排列方式要作为一种视图，用途是
 * "筛选后并列比较几件不同装备"，排列参考 grimtools 的 item-card。
 *
 * ★ **两种「详情」模式**（使用者 2026-09-14，由工具条那个下拉切换）：
 *
 * | 模式 | 卡片高度 | 排列 |
 * |---|---|---|
 * | `full`（**全部显示**，默认） | 随内容 | **瀑布流**：每张卡接在同一列上一张的结尾 +12px，各列顶部错落，不留大片空白 |
 * | `fixed-height`（**固定高度**） | 全部**等高** = 内容区高度 × 0.8 | 按行排列（flex 换行） |
 *
 * 固定高度的那 0.8 倍由本组件测量：`.app__content`（列表 / 固定栏所在的那一行）
 * 的高度 × 0.8，用 `ResizeObserver` 跟着——窗口缩放、过滤器面板开合、
 * 专注模式切换都会改它，卡片高度随之同步。属性装不下时在**卡片内部滚动**
 * （`TooltipCard` 的属性区本来就是可滚的，还带上下两条遮罩条）。
 *
 * 卡片**内容**整个交给 `TooltipCard`（与详情面板共用，见它的说明）。
 */
export default function CompareView({
  items,
  onItemHover,
  onItemActivate,
  pinnedId,
}: ItemViewProps) {
  const { displayMode } = useItemDetail();
  const fixedHeight = displayMode === 'fixed-height';

  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fixedHeight) return;

    const grid = gridRef.current;
    const content = grid?.closest('.app__content') as HTMLElement | null;
    if (!grid || !content) return;

    const apply = () => {
      // 卡片高度 = 内容区高度 × 0.8（使用者 2026-09-14 指定）
      grid.style.setProperty('--compare-fixed-height', `${Math.round(content.clientHeight * 0.8)}px`);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(content);
    return () => observer.disconnect();
  }, [fixedHeight]);

  return (
    <div
      ref={gridRef}
      className={`compare-grid compare-grid--${fixedHeight ? 'fixed' : 'full'}`}
    >
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
