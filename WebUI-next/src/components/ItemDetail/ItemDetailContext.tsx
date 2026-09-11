import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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

/**
 * 详情面板的显示方式（使用者 2026-09-12 要求增加第二种）。
 *
 * - `hover`：跟随鼠标浮动（原行为）
 * - `docked`：在视图**右侧固定一个框**。选中了就显示选中的，没选中就跟着
 *   hover 走——这正是使用者描述的期望。
 *
 * 两者只在**定位**上不同，选中/hover 的语义完全一样，所以实现上只切一个
 * CSS 类，不复制逻辑。
 */
export type DetailDisplayMode = 'hover' | 'docked';

const MODE_STORAGE_KEY = 'iagd.detailDisplayMode';

function readStoredMode(): DetailDisplayMode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'docked' ? 'docked' : 'hover';
  } catch {
    return 'hover';
  }
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
  /** 显示方式：浮动跟随 / 右侧固定框 */
  displayMode: DetailDisplayMode;
  setDisplayMode: (mode: DetailDisplayMode) => void;

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
  const [displayMode, setDisplayModeState] = useState<DetailDisplayMode>(readStoredMode);

  const setDisplayMode = useCallback((mode: DetailDisplayMode) => {
    setDisplayModeState(mode);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      /* 存不了就算了，只是下次打开回到默认值 */
    }
  }, []);

  const onItemHover = useCallback(
    (item: IItem | null, element: HTMLElement | null) => {
      // 已固定时忽略 hover：否则鼠标扫过列表会把固定好的面板换掉，
      // "固定"就失去意义了。
      if (pinned) return;

      if (!item || !element) {
        // ★ docked 模式（右侧固定框）下**不清空**。
        //   面板在右边，鼠标要从卡片移过去才能滚动，中途必然经过空白 →
        //   清空的话，使用者刚想看长属性、鼠标一动内容就没了。
        //   所以这里保留最后指过的那件；移到别的卡片上会正常换。
        if (displayMode === 'docked') return;

        setPreview(null);
        return;
      }

      setPreview({ item, rect: element.getBoundingClientRect() });
    },
    [pinned, displayMode],
  );

  const onItemActivate = useCallback((item: IItem) => {
    setPinned((current) =>
      // 再点一次同一件 → 取消固定
      current?.uniqueIdentifier === item.uniqueIdentifier ? null : item,
    );
    setPreview(null);
  }, []);

  /**
   * ★ 使用者要求：在**任意空白处**单击左键都取消选中。
   *
   * 原来只有"点面板里的关闭"和"再点一次同一件"两条路，读长属性时很别扭。
   *
   * 用 `mousedown` 而不是 `click`：拖动滚动条、选中文字都不该触发取消，
   * 而 `mousedown` 只在真正按下时到达。点在**物品卡片**上时也不取消——
   * 那是"改选另一件"，交给卡片自己的点击处理。
   */
  useEffect(() => {
    if (!pinned) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('.item-detail')) return; // 面板内部
      if (target.closest('[data-item-card]')) return; // 改选另一件

      setPinned(null);
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [pinned]);

  const value = useMemo<ItemDetailContextValue>(
    () => ({
      item: pinned ?? preview?.item ?? null,
      isPinned: pinned !== null,
      // docked 模式下锚点无意义（面板固定在右侧），传 null 让面板忽略它
      anchor: pinned || displayMode === 'docked' ? null : (preview?.rect ?? null),
      pinnedId: pinned?.uniqueIdentifier ?? null,
      displayMode,
      setDisplayMode,
      onItemHover,
      onItemActivate,
      onTransferred,
    }),
    [pinned, preview, displayMode, setDisplayMode, onItemHover, onItemActivate, onTransferred],
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
