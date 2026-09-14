import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useItemDetail } from './ItemDetailContext';
import TooltipCard from '../ItemTooltip/TooltipCard';
import './ItemDetail.css';

const PANEL_WIDTH = 380;
const GAP = 12;

/**
 * 浮动面板的位置（使用者 2026-09-14 的两条要求）。
 *
 * 水平：面板放在卡片的**另一侧**——卡片在屏幕左半就放右边、右半就放左边。
 *   （"根据点击的卡片在排列中的左右位置显示在另一侧"。）
 *   选中的那一侧放不下时自动翻到另一侧，仍放不下就贴住视口边。
 *
 * 垂直：把面板的**中线**对准卡片的中线——这需要知道面板高度，
 *   所以由组件测量后传进来。高度还不知道（首帧）时退回"与卡片顶部对齐"。
 *   面板比视口还高时以"能完整看到"为先，把它夹在上下边距之间。
 */
function floatingStyle(rect: DOMRect, panelHeight: number | null): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const cardOnLeftHalf = rect.left + rect.width / 2 < vw / 2;
  let left = cardOnLeftHalf ? rect.right + GAP : rect.left - PANEL_WIDTH - GAP;
  if (left + PANEL_WIDTH > vw - GAP) {
    left = Math.max(GAP, rect.left - PANEL_WIDTH - GAP);
  }
  if (left < GAP) {
    left = Math.max(GAP, Math.min(vw - PANEL_WIDTH - GAP, rect.right + GAP));
  }

  const top =
    panelHeight === null
      ? Math.max(GAP, rect.top)
      : Math.min(
          Math.max(GAP, rect.top + rect.height / 2 - panelHeight / 2),
          Math.max(GAP, vh - GAP - panelHeight),
        );

  return {
    position: 'fixed',
    left,
    top,
    width: PANEL_WIDTH,
    maxHeight: `calc(100vh - ${GAP * 2}px)`,
  };
}

/** 拿不到卡片位置时的兜底：贴在右上角，不随鼠标移动 */
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
 *
 * ★ 面板的**内容**（图标 / 名字 / 等级 / 完整属性）整个交给 `TooltipCard`——
 *   它与「详细对照」的卡片是同一个组件，所以字体、字号、颜色天然一致
 *   （使用者 2026-09-14 要求）。这里只剩三件"面板自己的事"：
 *   定位、滚动外壳、以及那个「取消固定」按钮（`item-detail__close`）。
 *
 * ★ 页脚已整块删掉（2026-09-14）：`baseRecord` 是内部记录名、「转移到游戏」
 *   与卡片上的「取出」重复、「硬核」是账号维度的事。
 */
export default function ItemDetailPanel() {
  const { item, isPinned, anchor, displayMode, onItemActivate } = useItemDetail();

  /** 面板自身高度：浮动定位要拿它算"中线对齐"，见 floatingStyle。 */
  const panelRef = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  /*
   * 在浏览器**绘制之前**量高度（`useLayoutEffect` 的语义），
   * 所以"先按顶部定位、再改成居中"这一下不会闪。
   * 依赖里放物品 id：换一件就重新量（不同物品属性行数不同）。
   */
  useLayoutEffect(() => {
    setPanelHeight(panelRef.current?.getBoundingClientRect().height ?? null);
  }, [item?.uniqueIdentifier, displayMode, isPinned]);

  if (!item) return null;

  /**
   * 固定栏模式（左或右）。
   *
   * 这两种模式下**不设 inline 定位**：面板由 AppShell 渲染在 grid 的栏里，
   * 是普通文档流元素——所以它天然位于工具条下方（不顶头），且"始终留栏、
   * 与是否选中无关"由栏的宽度保证。样式见 ItemDetail.css 的 [data-docked]。
   */
  const docked = displayMode !== 'hover';
  const style = docked ? undefined : anchor ? floatingStyle(anchor, panelHeight) : PINNED_STYLE;

  return (
    <aside
      ref={panelRef}
      className="item-detail"
      style={style}
      data-pinned={isPinned || undefined}
      data-docked={docked || undefined}
      data-mode={displayMode}
    >
      <TooltipCard
        item={item}
        action={
          /*
           * 面板独有的按钮。只有"点击固定"之后才需要它（预览态面板
           * `pointer-events: none`，点了也没用）。
           */
          isPinned ? (
            <button
              type="button"
              className="item-detail__close"
              title="取消固定"
              aria-label="取消固定"
              onClick={() => onItemActivate(item)}
            >
              ×
            </button>
          ) : undefined
        }
      />
    </aside>
  );
}
