import type { ReactNode } from 'react';
import type IItem from '../../model/item';
import { itemTypeLabel } from '../../model/item';
import { isJewelrySlot, slotLabel } from '../../model/slot';
import { iconUrl } from '../../api';
import { qualityClass } from '../ItemCard/quality';
import { formatNumber } from '../../model/format';
import ItemName from '../ItemName';
import StatList from '../ItemDetail/StatList';
import ReplicaStatList from '../ItemDetail/ReplicaStatList';
import { useTranslation } from '../../i18n';
import '../ItemDetail/ReplicaStatList.css';
import './TooltipCard.css';

interface Props {
  item: IItem;
  /**
   * 抬头右侧的操作区。这是两个使用方**唯一**不同的地方：
   * - 「详细对照」放「取出」按钮（`TransferButton`）
   * - 详情面板放「取消固定」（`item-detail__close`）
   */
  action?: ReactNode;
  /** 图标是否懒加载。长列表里的对照卡片要，单开的详情面板不必。 */
  lazyIcon?: boolean;
}

/**
 * 物品 tooltip 卡片：**图标 + 名字 + 等级 + 完整属性**。
 *
 * ★ 为什么抽成一个组件（使用者 2026-09-14）：
 *   "分栏列表 / 简洁卡片的 item-detail 应该和详细对照的 compare-card 的样式
 *   一样才对（字体、字号、颜色）。他们的代码应该是复用的。"
 *
 *   两处本来就是**同一种东西**——把游戏原样导出的 tooltip 摊开给人看，
 *   只是一个放侧栏 / 浮动、一个并排铺在网格里。原先各写了一套抬头与属性区，
 *   于是字号（11 vs 12）、内边距、图标处理都会悄悄漂移。
 *
 *   现在：结构与样式都在这里，外壳（尺寸、背景、边框、滚动）留给使用方——
 *   于是"字体、字号、颜色"天然一致，而 `item-detail__close` 与 `transfer-btn`
 *   这两种各自不同的按钮通过 `action` 插槽传进来。
 *
 * ★ 属性区优先渲染 `replicaStats`（游戏原样导出的完整 tooltip，带颜色码、
 *   套装、授予技能、转换行）；`headerStats` / `bodyStats` 是 IA 自己拼的、
 *   覆盖不全，只在没有 replica 时兜底。
 */
export default function TooltipCard({ item, action, lazyIcon }: Props) {
  const t = useTranslation();
  const icon = iconUrl(item.icon);
  const typeLabel = itemTypeLabel(item);

  return (
    <>
      <header className="tt-card__head">
        {icon && (
          /*
           * 外框固定 64×64；**首饰**（勋章 / 项链 / 戒指）的图标本来就是
           * 32×32 的小方图，放大到 64 会糊，所以按原尺寸居中显示
           * （判据见 model/slot.ts 的 isJewelrySlot）。
           */
          <div className="tt-card__icon-frame">
            <img
              className={`tt-card__icon${isJewelrySlot(item.slot) ? ' is-jewelry' : ''}`}
              src={icon}
              alt=""
              width={64}
              height={64}
              loading={lazyIcon ? 'lazy' : undefined}
            />
          </div>
        )}

        <div className="tt-card__title">
          {/* 名字由 ItemName 用我们自己的词缀表组装，见 model/affixes.ts */}
          <h2 className={`tt-card__name ${qualityClass(item.quality)}`}>
            <ItemName item={item} />
          </h2>
          <p className="tt-card__meta">
            {/*
              类型文本（"传奇护肩"）**不在这里显示**——属性区第一行就是
              `tt-type-66`，抬头再放一遍是完全重复（使用者 2026-09-14）。
              只有拿不到类型文本时才用槽位兜底。
            */}
            <span>等级 {formatNumber(item.level)}</span>
            {!typeLabel && item.slot && <span>{slotLabel(item.slot, t)}</span>}
          </p>
        </div>

        {action}
      </header>

      {/*
        属性区同样是「外壳 + 滚动层」两层：外壳不滚动，上下各钉一条 4px 的
        背景色遮罩条（见 CSS）；真正的滚动在内层——滚动层如果自己带 padding，
        `sticky` 的遮罩条会被"粘性约束矩形"限制在 content box 里，贴不到边框。
      */}
      <div className="tt-card__body">
        <div className="tt-card__body-scroll">
          {item.replicaStats.length > 0 ? (
            <ReplicaStatList rows={item.replicaStats} />
          ) : (
            <>
              <StatList stats={item.headerStats} />
              <StatList stats={item.bodyStats} />
            </>
          )}

          {item.replicaStats.length === 0 &&
            item.headerStats.length === 0 &&
            item.bodyStats.length === 0 && (
              <p className="tt-card__empty">这件物品没有可显示的属性。</p>
            )}
        </div>
      </div>
    </>
  );
}
