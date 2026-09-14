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
 * 「详情」的显示方式。**按视图不同**，同一个下拉里会出现不同的选项
 * （见 `views/types.ts` 的 `detailModes`）。
 *
 * 侧栏 / 浮动面板类（分栏列表、简洁卡片）：
 * - `hover`：跟随鼠标浮动（原行为）
 * - `docked-left` / `docked-right`：在视图的**左/右侧固定一栏**。选中了就显示
 *   选中的，没选中就跟着 hover 走。
 *
 * 对照卡片类（详细对照，使用者 2026-09-14 要求增加）：
 * - `full`：**瀑布**——卡片高度由属性多少决定，布局是**瀑布流**
 *   （每张卡接在同一列上一张的结尾，各列顶部错落）。
 * - `fixed-height`：**固定高度**——卡片等高，高度 = 内容区高度 × 0.8，
 *   随窗口与过滤器开合同步变化，属性多时在卡片内部滚动。
 */
export type DetailDisplayMode =
  | 'hover'
  | 'docked-left'
  | 'docked-right'
  | 'full'
  | 'fixed-height';

/** 侧栏 / 浮动面板那三种，顺序即它们的「详情」下拉里的顺序。 */
export const ALL_DETAIL_MODES: DetailDisplayMode[] = ['hover', 'docked-left', 'docked-right'];

/** 详细对照的两种卡片布局。 */
export const COMPARE_DETAIL_MODES: DetailDisplayMode[] = ['full', 'fixed-height'];

/**
 * 把用户存下的偏好**收敛到当前视图允许的范围**里。
 *
 * 视图只允许其中一部分（见 `views/types.ts` 的 `detailModes`）。偏好不被支持时
 * 回退到该视图的第一个选项。
 */
export function effectiveDetailMode(
  mode: DetailDisplayMode | undefined,
  allowed?: DetailDisplayMode[],
): DetailDisplayMode {
  const list = allowed && allowed.length > 0 ? allowed : ALL_DETAIL_MODES;
  return mode && list.includes(mode) ? mode : list[0];
}

/** 固定栏在哪一侧（其余模式为 null）。 */
export function dockedSide(mode: DetailDisplayMode): 'left' | 'right' | null {
  if (mode === 'docked-left') return 'left';
  if (mode === 'docked-right') return 'right';
  return null;
}

const MODE_STORAGE_KEY = 'iagd.detailDisplayMode';

/**
 * 每个视图各存一份偏好（使用者 2026-09-14："不同视图下详情的选择各不相同"）。
 *
 * `'*'` 是旧版本留下的"全局值"——早期只存一个字符串，现在读到时当作所有视图
 * 的默认，然后被访问过的视图各自覆盖。
 */
type ModeMap = Record<string, DetailDisplayMode>;

function isDetailMode(value: unknown): value is DetailDisplayMode {
  return (
    value === 'hover' ||
    value === 'docked-left' ||
    value === 'docked-right' ||
    value === 'full' ||
    value === 'fixed-height'
  );
}

function readStoredModes(): ModeMap {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);

    // 兼容最早那一版：只区分"是否固定"，存的是一个字符串
    if (typeof parsed === 'string') {
      if (parsed === 'docked') return { '*': 'docked-right' };
      return isDetailMode(parsed) ? { '*': parsed } : {};
    }

    if (parsed && typeof parsed === 'object') {
      const map: ModeMap = {};
      for (const [view, mode] of Object.entries(parsed as Record<string, unknown>)) {
        if (isDetailMode(mode)) map[view] = mode;
      }
      return map;
    }

    return {};
  } catch {
    return {};
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
  /**
   * 点击某件物品：固定 / 取消固定。
   *
   * `element` 是那张卡片本身——浮动模式下要靠它的屏幕位置决定面板放哪一侧
   * （使用者 2026-09-14 要求"根据卡片在排列中的左右位置显示在另一侧"）。
   */
  onItemActivate: (item: IItem, element?: HTMLElement | null) => void;

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
  viewId,
  detailModes,
}: {
  children: ReactNode;
  onTransferred?: () => void;
  /**
   * 当前视图 id。**每个视图各存一份「详情」偏好**（使用者 2026-09-14：
   * "不同视图下详情的选择各不相同"），所以 Provider 得知道自己在替谁存。
   */
  viewId: string;
  /**
   * 当前视图允许的详情方式（见 `views/types.ts` 的 `detailModes`）。
   *
   * ★ 为什么由外层传进来：Provider 自己不知道"现在是什么视图"，而
   *   "hover 时要不要保留内容""面板算不算固定栏"这些**行为**都取决于
   *   实际生效的模式。存下来的偏好不被当前视图支持时，这里就收敛掉，
   *   以免出现"模式是浮动、行为按固定栏"这种自相矛盾的状态。
   */
  detailModes?: DetailDisplayMode[];
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pinned, setPinned] = useState<IItem | null>(null);
  /**
   * 点击固定时那张卡片的屏幕位置。
   *
   * ★ 原来固定后一律贴右上角，现在要"根据卡片在排列中的左右位置显示在另一侧"
   *   （使用者 2026-09-14），所以得把位置留下来。
   */
  const [pinnedRect, setPinnedRect] = useState<DOMRect | null>(null);
  /** 各视图的偏好，键是视图 id（另有旧的全局键 `'*'`）。 */
  const [modeByView, setModeByView] = useState<ModeMap>(readStoredModes);

  /** 实际生效的模式：本视图存过的 → 旧的全局值 → 该视图的第一个选项。 */
  const displayMode = effectiveDetailMode(
    modeByView[viewId] ?? modeByView['*'],
    detailModes,
  );

  // 偏好落盘（初始化时也会写一次，顺带把旧的"全局字符串"迁移成 map）
  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(modeByView));
    } catch {
      /* 存不了就算了，只是下次打开回到默认值 */
    }
  }, [modeByView]);

  const setDisplayMode = useCallback(
    (mode: DetailDisplayMode) => {
      // 只改**当前视图**那一份，别的视图保持不动
      setModeByView((current) => ({ ...current, [viewId]: mode }));
    },
    [viewId],
  );

  const onItemHover = useCallback(
    (item: IItem | null, element: HTMLElement | null) => {
      // 已固定时忽略 hover：否则鼠标扫过列表会把固定好的面板换掉，
      // "固定"就失去意义了。
      if (pinned) return;

      /*
       * ★ 浮动模式**完全不响应鼠标悬浮**（使用者 2026-09-15）：
       *   简洁卡片的浮动详情只在**点击卡片**时弹出，鼠标扫过列表不再弹面板。
       *   （原来"指到哪张就弹哪张"太容易误触，面板还一直挡着旁边的卡片。）
       */
      if (displayMode === 'hover') return;

      /*
       * 固定栏模式：指到哪件就换哪件；移开时**不清空**、保留最后一件——
       * 面板在侧边栏里，鼠标要移过去才能滚动，中途必然经过空白，
       * 清空的话刚想看的长属性一动就没了。
       */
      if (!item || !element) return;

      setPreview({ item, rect: element.getBoundingClientRect() });
    },
    [pinned, displayMode],
  );

  const onItemActivate = useCallback(
    (item: IItem, element?: HTMLElement | null) => {
      if (pinned?.uniqueIdentifier === item.uniqueIdentifier) {
        // 再点一次同一件 → 取消固定
        setPinned(null);
        setPinnedRect(null);
      } else {
        setPinned(item);
        setPinnedRect(element ? element.getBoundingClientRect() : null);
      }
      setPreview(null);
    },
    [pinned],
  );

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
      /*
       * 浮动模式只显示"点击固定"的那件（2026-09-15 起不再跟随鼠标悬浮）；
       * 固定栏模式还会跟着 hover 走，没固定时显示最后指过的那件。
       */
      item: pinned ?? (displayMode === 'hover' ? null : (preview?.item ?? null)),
      isPinned: pinned !== null,
      /*
       * 浮动模式的锚点：固定时用那张卡片的位置（决定面板浮在哪一侧）。
       * 固定栏模式下锚点无意义（面板在栏里，不跟鼠标），传 null 让面板忽略它。
       */
      anchor: displayMode !== 'hover' ? null : (pinnedRect ?? preview?.rect ?? null),
      pinnedId: pinned?.uniqueIdentifier ?? null,
      displayMode,
      setDisplayMode,
      onItemHover,
      onItemActivate,
      onTransferred,
    }),
    [pinned, pinnedRect, preview, displayMode, setDisplayMode, onItemHover, onItemActivate, onTransferred],
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
