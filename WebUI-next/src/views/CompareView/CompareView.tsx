import type { ItemViewProps } from '../types';
import { iconUrl } from '../../api';
import { qualityClass } from '../../components/ItemCard/quality';
import TransferButton from '../../components/TransferButton/TransferButton';
import ReplicaStatList from '../../components/ItemDetail/ReplicaStatList';
import ItemName from '../../components/ItemName';
import { slotLabel } from '../../model/slot';
import { itemTypeLabel } from '../../model/item';
import { useTranslation } from '../../i18n';
import './CompareView.css';

/**
 * 「详细对照」视图：把筛选结果**并排摊开**，一眼比较几件装备的完整属性。
 *
 * 使用者 2026-09-12 要求：原有的大卡片排列方式要作为一种视图，用途是
 * "筛选后并列比较几件不同装备"，排列参考 grimtools 的 item-card——
 * 卡片高度按内容多少，**同一行以最宽的为准**。
 *
 * 实现要点：外层 `display: flex` + `align-items: stretch`（默认值），
 * 同一行的卡片就自动等高、取最高的那个。不需要 JS 测量高度——
 * 这正是 flex 布局擅长的，量高度反而会遇到"图片加载完高度才变"的时序问题。
 */
export default function CompareView({
  items,
  onItemHover,
  onItemActivate,
  pinnedId,
}: ItemViewProps) {
  const t = useTranslation();

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
            onClick={() => onItemActivate?.(item)}
          >
            <header className="compare-card__head">
              {item.icon && (
                <img
                  className="compare-card__icon"
                  src={iconUrl(item.icon)}
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                />
              )}

              <div className="compare-card__title">
                <h2 className={`compare-card__name ${qualityClass(item.quality)}`}>
                  <ItemName item={item} />
                </h2>
                <p className="compare-card__meta">
                  <span className="item-type">{itemTypeLabel(item) ?? item.quality}</span>
                  <span>等级 {item.level}</span>
                  {/*
                    不再单列槽位：类型文本里已经说了部位（"传奇护肩"的"护肩"），
                    再跟一个"肩甲"是重复的（使用者 2026-09-12 指出）。
                    只有拿不到类型文本时才用槽位兜底。
                  */}
                  {!itemTypeLabel(item) && item.slot && <span>{slotLabel(item.slot, t)}</span>}
                </p>
              </div>

              <TransferButton item={item} />
            </header>

            <div className="compare-card__body">
              {item.replicaStats.length > 0 ? (
                <ReplicaStatList rows={item.replicaStats} />
              ) : (
                <p className="compare-card__empty">没有可显示的属性。</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
