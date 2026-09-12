import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from '../../i18n';
import { iconUrl, transferItems } from '../../api';
import { qualityClass } from '../ItemCard/quality';
import { slotLabel } from '../../model/slot';
import { playerItemId } from '../../model/item';
import { useItemDetail } from './ItemDetailContext';
import StatList from './StatList';
import ReplicaStatList, { parseRow } from './ReplicaStatList';
import './ReplicaStatList.css';
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



interface Feedback {
  ok: boolean;
  text: string;
}

/**
 * 物品详情面板。
 *
 * ★ 全应用**只有一个实例**（挂载在 App 顶层，见 ItemDetailContext 的说明）。
 * 这里只根据状态换内容与位置，不新建 DOM 节点。
 */
export default function ItemDetailPanel() {
  const { item, isPinned, anchor, displayMode, onItemActivate, onTransferred } = useItemDetail();
  const t = useTranslation();

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // 换了一件事物就把上一次的"转移结果"清掉，否则会张冠李戴。
  // 注意：这个 effect 必须在下面的提前 return 之前——否则 hook 调用顺序会变。
  useEffect(() => {
    setFeedback(null);
    setBusy(false);
  }, [item?.uniqueIdentifier]);

  if (!item) return null;

  const handleTransfer = async () => {
    const id = playerItemId(item);
    if (id === null) {
      setFeedback({ ok: false, text: '无法从标识里解析出物品 id' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = await transferItems([id], true);
      setFeedback({ ok: true, text: `已转移 ${result.numTransferred} 件` });
      onTransferred?.();
    } catch (err) {
      setFeedback({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  /**
   * 固定栏模式（左或右）。
   *
   * 这两种模式下**不设 inline 定位**：面板由 AppShell 渲染在 grid 的栏里，
   * 是普通文档流元素——所以它天然位于工具条下方（不顶头），且"始终留栏、
   * 与是否选中无关"由栏的宽度保证。样式见 ItemDetail.css 的 [data-docked]。
   */
  const docked = displayMode !== 'hover';
  const style = docked ? undefined : isPinned || !anchor ? PINNED_STYLE : floatingStyle(anchor);

  return (
    <aside
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
          {/*
            物品名里可能带**词缀的颜色代码**：汉化包把前缀/后缀定义成
            `^y磐石☆·` / `^y·野猪☆`（`☆` 是"推荐词缀"标记），而
            `ItemOperationsUtility.GetItemName` 是**直接取 tag 文本**拼名字的，
            所以这些代码会原样出现在 item.name 里。
            解析后未被代码覆盖的部分继承父元素的颜色 —— 也就是下面的稀有度色。
          */}
          <h2 className={`item-detail__name ${qualityClass(item.quality)}`}>
            {parseRow(item.name)}
          </h2>
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

      {isPinned && (
        <footer className="item-detail__foot">
          <code title={item.baseRecord}>{item.baseRecord}</code>
          {item.isHardcore && <span className="item-detail__tag">硬核</span>}
          <button
            type="button"
            className="item-detail__transfer"
            disabled={busy}
            onClick={handleTransfer}
          >
            {busy ? '转移中…' : '转移到游戏'}
          </button>
        </footer>
      )}

      {feedback && (
        <p className={`item-detail__feedback ${feedback.ok ? 'is-ok' : 'is-err'}`}>
          {feedback.text}
        </p>
      )}
    </aside>
  );
}
