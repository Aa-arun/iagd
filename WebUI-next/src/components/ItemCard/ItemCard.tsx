import type IItem from '../../model/item';
import { itemTypeLabel } from '../../model/item';
import { formatNumber } from '../../model/format';
import { iconUrl } from '../../api';
import { qualityClass } from './quality';
import ItemName from '../ItemName';
import TransferButton from '../TransferButton/TransferButton';
import './ItemCard.css';

/**
 * 物品卡片（简洁卡片视图用）。
 *
 * ★ 2026-09-14 按使用者意见做了减法：
 *   · 「品质」只留 `item-type` 的值（"传奇护肩"这种），不再重复一个"品质"标签；
 *   · 删掉「来源」——库里只有 `Player`（自己的物品）一种，其余类型（好友 / 图纸）
 *     在浏览器界面上根本不出现，这一栏永远是同一个值；
 *   · 删掉「硬核」——它是**账号维度**的属性（普通 / 硬核角色），列表本来就按当前
 *     角色过滤过了，逐件显示没有信息量；
 *   · 删掉 `item-card__record`（`baseRecord` 是游戏内部记录名，用户看不懂）。
 *
 * 想在列表里一眼分辨的只有：图标 / 名字 / 类型 / 等级。
 */
export default function ItemCard({ item }: { item: IItem }) {
  const icon = iconUrl(item.icon);

  return (
    <article className="item-card" data-item-card>
      <div className="item-card__icon">
        {icon ? (
          <img src={icon} alt="" width={64} height={64} loading="lazy" />
        ) : (
          <div className="item-card__icon-missing" title="数据库里没有这件物品的图标" />
        )}
      </div>

      <div className="item-card__body">
        <div className="item-card__name-row">
          <h2 className={`item-card__name ${qualityClass(item.quality)}`}>
            <ItemName item={item} />
          </h2>
          <TransferButton item={item} />
        </div>

        <dl className="item-card__meta">
          <div>
            <dd className="item-type">{itemTypeLabel(item) ?? item.quality}</dd>
          </div>
          <div>
            <dt>等级</dt>
            <dd>{formatNumber(item.level)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
