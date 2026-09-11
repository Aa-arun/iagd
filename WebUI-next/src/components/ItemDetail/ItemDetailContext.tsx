import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type IItem from '../../model/item';

/**
 * 详情面板的状态。
 *
 * 采用 `03-目标架构.md` §6.3 的**混合方案**：
 * - **hover** → 显示简版预览（跟随触发元素定位，移开即消失）
 * - **点击** → 固定为全版（不再随 hover 变化，可自由滚动阅读）
 *
 * ★ 性能要点（同 §6.3）：面板**全应用只有一个实例**。
 * 列表可能有上千件，若每件物品各挂一个面板，快速划过时会反复创建/销毁 DOM。
 * 这里把状态提到顶层，面板只换内容、不换节点。
 */

interface PreviewState {
  item: IItem;
  /** 触发元素的屏幕位置，用于定位面板 */
  rect: DOMRect;
}

interface ItemDetailContextValue {
  /** 当前该显示的物品（固定的优先） */
  item: IItem | null;
  /** 是否处于"点击固定"状态（决定显示全版还是简版） */
  isPinned: boolean;
  /** hover 时的锚点；已固定时为 null */
  anchor: DOMRect | null;
  /** 已固定物品的 id，供视图高亮 */
  pinnedId: string | null;

  // ↓ 交给视图的回调（视图仍然只"接数据 + 发事件"，不自己取数据）
  onItemHover: (item: IItem | null, element: HTMLElement | null) => void;
  onItemActivate: (item: IItem) => void;

  /**
   * 转移成功后由面板调用，通知外层刷新列表。
   * 由 App 通过 Provider 的 prop 注入——面板自己不该知道"列表怎么重新加载"。
   */
  onTransferred?: () => void;
}

const ItemDetailContext = createContext<ItemDetailContextValue | null>(null);

export function ItemDetailProvider({
  children,
  onTransferred,
}: {
  children: ReactNode;
  onTransferred?: () => void;
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pinned, setPinned] = useState<IItem | null>(null);

  const onItemHover = useCallback(
    (item: IItem | null, element: HTMLElement | null) => {
      // 已固定时忽略 hover：否则鼠标扫过列表会把固定好的面板换掉，
      // "固定"就失去意义了。
      if (pinned) return;
      setPreview(item && element ? { item, rect: element.getBoundingClientRect() } : null);
    },
    [pinned],
  );

  const onItemActivate = useCallback((item: IItem) => {
    setPinned((current) =>
      // 再点一次同一件 → 取消固定
      current?.uniqueIdentifier === item.uniqueIdentifier ? null : item,
    );
    setPreview(null);
  }, []);

  const value = useMemo<ItemDetailContextValue>(
    () => ({
      item: pinned ?? preview?.item ?? null,
      isPinned: pinned !== null,
      anchor: pinned ? null : (preview?.rect ?? null),
      pinnedId: pinned?.uniqueIdentifier ?? null,
      onItemHover,
      onItemActivate,
      onTransferred,
    }),
    [pinned, preview, onItemHover, onItemActivate, onTransferred],
  );

  return <ItemDetailContext.Provider value={value}>{children}</ItemDetailContext.Provider>;
}

/**
 * 取详情面板的上下文。
 * 在 Provider 之外调用会抛错——这是刻意的：静默返回 null 会让
 * "忘了套 Provider"变成一个很难查的空白界面。
 */
export function useItemDetail(): ItemDetailContextValue {
  const ctx = useContext(ItemDetailContext);
  if (!ctx) {
    throw new Error('useItemDetail 必须在 <ItemDetailProvider> 内使用');
  }
  return ctx;
}
