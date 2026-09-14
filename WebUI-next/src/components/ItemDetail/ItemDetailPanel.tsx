import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { iconUrl } from '../../api';
import { qualityClass } from '../ItemCard/quality';
import { itemTypeLabel } from '../../model/item';
import { useItemDetail } from './ItemDetailContext';
import StatList from './StatList';
import ReplicaStatList from './ReplicaStatList';
import ItemName from '../ItemName';
import './ReplicaStatList.css';
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
 * ★ 2026-09-14：**页脚整块删掉**（使用者要求）。原来浮动固定时底下有一行
 *   `baseRecord` + 「转移到游戏」按钮 + 「硬核」标签：
 *   · `baseRecord` 是游戏内部记录名，用户看不懂；
 *   · 「取出」在卡片/列表里本来就有；
 *   · 硬核与否是账号维度的事，对单件物品没有意义。
 *   固定栏模式早就没有这一行，现在浮动模式也去掉，两种形态一致。
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
          {/* 名字由 ItemName 用我们自己的词缀表组装，见 model/affixes.ts */}
          <h2 className={`item-detail__name ${qualityClass(item.quality)}`}>
            <ItemName item={item} />
          </h2>
          <p className="item-detail__meta">
            {/*
              用**类型文本**（"传奇护肩"）而不是 `item.quality` —— 后者是
              `Epic` / `Blue` 这种数据库内部值，对使用者没有意义。
              槽位也不再单列：类型文本里已经含部位。
            */}
            <span className="item-type">{itemTypeLabel(item) ?? item.quality}</span>
            <span>等级 {item.level}</span>
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
        {/*
          ★ 优先渲染 `replicaStats`——那是**游戏原样导出的完整 tooltip**
          （含颜色代码、套装、授予技能、转换行），所以它和游戏里看到的最接近。
          `headerStats`/`bodyStats` 是 IA 自己从 DatabaseItemStat 拼的，覆盖不全
          （实测这批物品里 headerStats 全是空的），只在没有 replica 时兜底。
        */}
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
            <p className="item-detail__empty">这件物品没有可显示的属性。</p>
          )}
      </div>
    </aside>
  );
}
