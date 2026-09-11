import type IItem from '../../model/item';
import { IItemType } from '../../model/enums';
import { iconUrl } from '../../api';
import { qualityClass } from './quality';
import './ItemCard.css';

/**
 * 物品卡片。
 *
 * A0 阶段只显示最关键的几项（图标 / 名称 / 品质 / 等级），
 * 属性列表要等 A5 的详情面板。
 */
export default function ItemCard({ item }: { item: IItem }) {
  const icon = iconUrl(item.icon);

  return (
    <article className="item-card">
      <div className="item-card__icon">
        {icon ? (
          <img src={icon} alt="" width={64} height={64} loading="lazy" />
        ) : (
          <div className="item-card__icon-missing" title="数据库里没有这件物品的图标" />
        )}
      </div>

      <div className="item-card__body">
        <h2 className={`item-card__name ${qualityClass(item.quality)}`}>{item.name}</h2>

        <dl className="item-card__meta">
          <div>
            <dt>品质</dt>
            <dd className={qualityClass(item.quality)}>{item.quality}</dd>
          </div>
          <div>
            <dt>等级</dt>
            <dd>{item.level}</dd>
          </div>
          <div>
            <dt>来源</dt>
            <dd>{typeLabel(item.type)}</dd>
          </div>
          <div>
            <dt>硬核</dt>
            <dd>{item.isHardcore ? '是' : '否'}</dd>
          </div>
        </dl>

        <p className="item-card__record" title={item.baseRecord}>
          {item.baseRecord}
        </p>
      </div>
    </article>
  );
}

function typeLabel(type: IItemType): string {
  switch (type) {
    case IItemType.Recipe:
      return '图纸';
    case IItemType.Buddy:
      return '好友';
    case IItemType.Player:
      return '玩家';
    case IItemType.Augmentation:
      return '镶嵌物';
    default:
      return '未知';
  }
}
