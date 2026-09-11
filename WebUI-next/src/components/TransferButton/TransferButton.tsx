import { useState, type MouseEvent } from 'react';
import { transferItems } from '../../api';
import { playerItemId } from '../../model/item';
import type IItem from '../../model/item';
import { useItemDetail } from '../ItemDetail/ItemDetailContext';
import './TransferButton.css';

/**
 * 「取出」按钮：把物品从 IA 送回游戏。
 *
 * 使用者 2026-09-12 要求：不必先选中弹出详情面板才能取出，列表和卡片里
 * 都要有一个顺手的按钮，做成**方形、图形化、拟物化**的样子。
 *
 * 交互上的两个要点：
 * - `stopPropagation`：不能让点击冒泡到卡片/行，否则会顺带把详情面板选中。
 * - 就地反馈：按钮自己短暂显示成功/失败（两秒后复位）。取回是"点一下就走"
 *   的操作，弹面板反而碍事；而失败必须让人看见，不能静默。
 */

type State = 'idle' | 'busy' | 'ok' | 'fail';

interface Props {
  item: IItem;
}

export default function TransferButton({ item }: Props) {
  const [state, setState] = useState<State>('idle');
  // 刷新列表的回调从详情面板的 Context 取——这样 ItemCard 之类的展示组件
  // 不用为了一个按钮多穿一层 props
  const { onTransferred } = useItemDetail();

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    // 只处理左键；右键/中键交给浏览器
    if (event.button !== 0) return;

    // ★ 别让卡片/行收到这次点击 —— 否则会顺带选中它、弹出详情面板
    event.stopPropagation();
    event.preventDefault();

    if (state === 'busy') return;

    const id = playerItemId(item);
    if (id === null) {
      setState('fail');
      setTimeout(() => setState('idle'), 2000);
      return;
    }

    setState('busy');
    try {
      await transferItems([id], true);
      setState('ok');
      onTransferred?.();
    } catch {
      setState('fail');
    }

    setTimeout(() => setState('idle'), 2000);
  };

  const title =
    state === 'ok' ? '已取出' : state === 'fail' ? '取出失败' : '取出到游戏（不需要先选中）';

  return (
    <button
      type="button"
      className="transfer-btn"
      data-state={state}
      title={title}
      aria-label={title}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {state === 'ok' ? (
        /* 对勾 */
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
        </svg>
      ) : state === 'fail' ? (
        /* 叉 */
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" />
        </svg>
      ) : (
        /* 向下进托盘 = "放回游戏" */
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.5v8" />
          <path d="M4.75 6.75 8 10l3.25-3.25" />
          <path d="M2.5 11.5v1.25a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11.5" />
        </svg>
      )}
    </button>
  );
}
