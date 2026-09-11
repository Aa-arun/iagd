import type { CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { iconUrl } from '../../api';
import { qualityClass } from '../ItemCard/quality';
import { slotLabel } from '../../model/slot';
import { useItemDetail } from './ItemDetailContext';
import StatList from './StatList';
import './ItemDetail.css';

const PANEL_WIDTH = 380;
const GAP = 12;

/**
 * hover 预览时的位置：优先放在触发元素**右侧**，
 * 右边空间不够就翻到左侧（屏幕边缘翻转，grimtools 也是这个思路）。
 */
function floatingStyle(rect: DOMRect): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.right + GAP;
  if (left + PANEL_WIDTH > vw) {
    left = Math.max(GAP, rect.left - PANEL_WIDTH - GAP);
  }

  // 顶部与触发元素对齐，但不许超出视口下沿
  const top = Math.min(Math.max(GAP, rect.top), Math.max(GAP, vh - 240));

  return {
    position: 'fixed',
    left,
    top,
    width: PANEL_WIDTH,
    maxHeight: `calc(100vh - ${GAP * 2}px)`,
  };
}

/** 点击固定后贴在右上角，不随鼠标移动 */
const PINNED_STYLE: CSSProperties = {
  position: 'fixed',
  right: 24,
  top: 24,
  width: PANEL_WIDTH,
  maxHeight: 'calc(100vh - 48px)',
};

/**
 * 物品详情面板。
 *
 * ★ 全应用**只有一个实例**（挂载在 App 顶层，见 ItemDetailContext 的说明）。
 * 这里只根据状态换内容与位置，不新建 DOM 节点。
 */
export default function ItemDetailPanel() {
  const { item, isPinned, anchor, onItemActivate } = useItemDetail();
  const t = useTranslation();

  if (!item) return null;

  const style = isPinned || !anchor ? PINNED_STYLE : floatingStyle(anchor);

  return (
    <aside className="item-detail" style={style} data-pinned={isPinned || undefined}>
      <header className="item-detail__head">
        {item.icon && (
          <img
            className="item-detail__icon"
            src={iconUrl(item.icon)}
            alt=""
            width={48}
            height={48}
          />
        )}
        <div className="item-detail__title">
          <h2 className={`item-detail__name ${qualityClass(item.quality)}`}>{item.name}</h2>
          <p className="item-detail__meta">
            <span className={qualityClass(item.quality)}>{item.quality}</span>
            <span>等级 {item.level}</span>
            {item.slot && <span>{slotLabel(item.slot, t)}</span>}
          </p>
        </div>

        {isPinned && (
          <button
            type="button"
            className="item-detail__close"
            title="取消固定"
            aria-label="取消固定"
            onClick={() => onItemActivate(item)}
          >
            ×
          </button>
        )}
      </header>

      {/* 滚动发生在这里：面板整体限高，只有属性区滚动 */}
      <div className="item-detail__body">
        <StatList stats={item.headerStats} />
        <StatList stats={item.bodyStats} />

        {item.headerStats.length === 0 && item.bodyStats.length === 0 && (
          <p className="item-detail__empty">这件物品没有可显示的属性。</p>
        )}
      </div>

      {isPinned && (
        <footer className="item-detail__foot">
          <code title={item.baseRecord}>{item.baseRecord}</code>
          {item.isHardcore && <span className="item-detail__tag">硬核</span>}
        </footer>
      )}
    </aside>
  );
}
