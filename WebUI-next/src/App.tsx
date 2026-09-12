import { useCallback, useEffect, useRef, useState } from 'react';
import {
  connectLive,
  fetchHealth,
  fetchI18n,
  fetchItems,
  searchItems,
  type I18nMap,
  type ItemsResponse,
  type LiveMaintenance,
} from './api';
import type IItem from './model/item';
import { MAX_ITEMS_PER_REQUEST } from './model/format';
import { I18nProvider } from './i18n';
import { ItemDetailProvider } from './components/ItemDetail';
import { useItemView } from './views/useItemView';
import { usePaging } from './views/usePaging';
import AppShell, { type Toast } from './AppShell';

/** 输入停顿多久才发请求。太短会让每敲一个字母都打一次后端。 */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * 轮询数据库总数变化的间隔。
 *
 * ⚠️ 这是 **B2（后端推送）连不上时的兜底**。正常情况下 `/ws` 会主动推
 * `itemsChanged`，那时完全不轮询。只有 WebSocket 断了才退回这里。
 */
const POLL_INTERVAL_MS = 4000;

/**
 * `fade` 的提示在屏幕上停留多久。
 *
 * 后端在 `AutoDismissNotifications` 打开、或程序在前台时会要求自动淡出；
 * 否则（使用者没看着窗口）留着不动，等他自己关掉——那是旧行为，沿用。
 */
const TOAST_AUTO_DISMISS_MS = 6000;

/** 发一次分页请求。`offset` 从 0 开始。 */
type PageFetcher = (offset: number, limit: number) => Promise<ItemsResponse>;

/** `fetchRange` 的产物：一批物品 + 判断"还有没有更多"需要的全部信息。 */
interface RangeResult {
  items: IItem[];
  /**
   * 匹配总数。⚠️ **只有从 offset=0 开始取时才有值**，否则是 `null`——
   * 原因见 `fetchRange` 里的说明（后端在 offset > 0 时会把本页条数当成总数）。
   * 也可能是 `-1`（超过后端单次上限，精确数未知）。
   */
  total: number | null;
  /** 已经取到的位置（最后一条的下一个下标） */
  endOffset: number;
  /** 最后一批是否**取满**——总数不可用时靠它判断还有没有下一页 */
  lastFull: boolean;
}

/**
 * 取 `[offset, offset + count)` 这一段。
 *
 * ★ 为什么要自己拼：后端**单次最多返回 1000 条**（`MAX_ITEMS_PER_REQUEST`），
 *   超了不报错、只是少给。所以想要更多就必须按 1000 一段、首尾相接地自己接起来。
 *
 * ★ ★ 为什么 `total` 可能返回 null（2026-09-12 实测到的后端坑）：
 *   后端 `PlayerItemDaoImpl.SearchForItems` 里有个分支是
 *   "这一批没被 1000 上限截断 ⇒ 这一批就是全部 ⇒ 总数 = 本批条数"。
 *   这个推断**只在 offset=0 时成立**。所以查第 2 页时它会把**本页条数**
 *   当成总数交出来：
 *
 *       66 件物品、每页 50 → 第 2 页返回 16 条，后端说 total=16
 *
 *   照单全收的话界面会显示「第 2 / 1 页 · 共 16 件」这种自相矛盾的东西。
 *   所以在**这里就把 offset > 0 的 total 丢掉**（置 null），让调用方沿用
 *   第 1 页拿到的那个可信总数——一个地方挡住，别让脏数据流到界面上。
 *
 *   ⚠️ 后端那一行是个真 bug（`skip == 0` 缺了），将来要修的话：
 *     `SearchForItems(query, offset, false, offset > 0, ...)` 让翻页时才精确计数。
 */
async function fetchRange(run: PageFetcher, offset: number, count: number): Promise<RangeResult> {
  const items: IItem[] = [];
  let total: number | null = null;
  let endOffset = offset;
  let lastFull = false;

  while (items.length < count) {
    const limit = Math.min(MAX_ITEMS_PER_REQUEST, count - items.length);
    const res = await run(endOffset, limit);

    // 只有"从头开始取"的那一次，总数才是可信的（见上面那段说明）
    if (endOffset === 0) total = res.total;

    items.push(...res.items);
    endOffset += res.items.length;

    // 没取满就说明到底了（再取也是空），取满则可能还有下一段
    lastFull = res.items.length === limit;
    if (!lastFull || res.items.length === 0) break;
  }

  return { items, total, endOffset, lastFull };
}

/**
 * 还有没有下一批。
 *
 * 两种情况分开处理：
 * - **总数可用**（>= 0）：直接比大小，这是常态。
 * - **总数不可用**（null，或者 -1 表示"超过后端单次上限"）：只能看
 *   "这一批有没有取满"——取满意味着后面可能还有，没取满就一定到底了。
 */
function moreAfter(result: RangeResult): boolean {
  if (result.total !== null && result.total >= 0) {
    return result.endOffset < result.total;
  }
  return result.lastFull;
}

/**
 * 根组件。
 *
 * 数据与界面文案全部来自 C# 后端的真实数据，不使用 mock。
 */
export default function App() {
  /** 顶层页签：物品（搜索自己的装备） / 数据库（维护） / 设置 */
  const [tab, setTab] = useState<'items' | 'database' | 'settings'>('items');
  /** 当前视图。工具条与列表是两个组件了，所以状态提到这里 */
  const { viewId, setViewId } = useItemView();
  /** 加载方式（无限滚动 / 翻页）+ 每页条数 + 当前页，偏好存 localStorage */
  const { loadMode, setLoadMode, pageSize, setPageSize, page, setPage } = usePaging();
  const [keyword, setKeyword] = useState('');

  /**
   * 当前要显示的物品。
   * 翻页模式 = 当前这一页；无限滚动 = 已经累积出来的全部。
   */
  const [items, setItems] = useState<IItem[]>([]);
  /** 匹配总数；`null` = 还没查过。可能是 `UNKNOWN_TOTAL` */
  const [total, setTotal] = useState<number | null>(null);
  /** 一批查询是否在进行中（首次加载、换搜索词、翻页、换每页条数都算） */
  const [loading, setLoading] = useState(true);
  /** 无限滚动：后面还有没有 */
  const [hasMore, setHasMore] = useState(false);
  /** 无限滚动：正在追加下一批 */
  const [loadingMore, setLoadingMore] = useState(false);

  const [i18n, setI18n] = useState<I18nMap>({});
  const [error, setError] = useState<string | null>(null);
  /** 自增即触发重新查询（转移物品后、或检测到数据库变化时用它刷新列表） */
  const [reloadToken, setReloadToken] = useState(0);
  /** 上一次看到的数据库物品总数；用 ref 是因为它只用于比较，不该触发渲染 */
  const knownTotalRef = useRef<number | null>(null);
  /** `/ws` 是否连着。连着就靠推送，断了才退回轮询 */
  const [live, setLive] = useState(false);
  /**
   * 维护状态，非 null 表示后端正在重建游戏数据库或重算物品属性。
   *
   * 那期间后端会把查询全部拒掉（503），因为库被清空了——照常查询会显示
   * 一个空列表，让人以为自己的物品没了。所以这里要整屏挡住，并显示进度。
   */
  const [maintenance, setMaintenance] = useState<LiveMaintenance | null>(null);

  /** 后端推来的提示。自己操作产生的反馈仍由各自的组件就地显示，不走这里。 */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  /**
   * 「这一批结果还作不作数」的代号。
   *
   * 搜索词 / 每页条数 / 页码 每变一次就 +1。还在路上的旧响应回来时对不上号，
   * 直接丢掉——否则一个慢的旧请求回来会把新结果覆盖掉。
   */
  const requestIdRef = useRef(0);

  /**
   * 已加载的条数。
   *
   * 查询 effect 里要读它（决定"重载时该拉多少"），但**不能**把它写进依赖数组——
   * 那样每次 items 变化都会再触发一次查询，直接死循环。所以用 ref 带出来。
   */
  const itemsRef = useRef<IItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /** 首批是否已经就位。没就位时不允许追加，否则会把新旧两个列表拼在一起 */
  const readyRef = useRef(false);

  /** 追加请求的去重锁：滚动事件可能连着触发好几次 */
  const appendingRef = useRef(false);

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, level: string, helpUrl: string | undefined, fade: boolean) => {
      const id = ++toastIdRef.current;
      setToasts((list) => [...list, { id, message, level, helpUrl }]);

      if (fade) {
        setTimeout(() => dismissToast(id), TOAST_AUTO_DISMISS_MS);
      }
    },
    [dismissToast],
  );

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // 翻译只取一次。失败也不致命——界面会退化成显示 `iatag_xxx` 原文。
  useEffect(() => {
    let cancelled = false;
    fetchI18n()
      .then((translations) => {
        if (!cancelled) setI18n(translations);
      })
      .catch(() => {
        /* 忽略：缺少翻译不影响功能 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 按当前关键词取一段。关键词为空就是"浏览全部" */
  const runQuery = useCallback<PageFetcher>(
    (offset, limit) => {
      const q = keyword.trim();
      return q ? searchItems({ wildcard: q, offset, limit }) : fetchItems(offset, limit);
    },
    [keyword],
  );

  /**
   * 查询主流程：关键词 / 每页条数 / 页码 / 重新加载 变化时触发。
   *
   * 它管的是"**替换**整个列表"；"往后追加"是下面的 `loadMore`。
   */
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    readyRef.current = false;
    appendingRef.current = false;
    setLoading(true);
    setLoadingMore(false);

    const timer = setTimeout(() => {
      /*
       * 要取哪一段？
       *
       * - 翻页模式：就是当前页。
       * - 无限滚动：**已经加载出来的那些全都要**。因为触发这里的可能是
       *   "在游戏里捡到东西"（`itemsChanged` 推送）——如果这时退回第一批，
       *   你滚到第 300 件时会被突然弹回列表开头。已加载超过 1000 条时，
       *   `fetchRange` 会自己分批。
       */
      const start = loadMode === 'paged' ? page * pageSize : 0;
      const count = loadMode === 'paged' ? pageSize : Math.max(pageSize, itemsRef.current.length);

      fetchRange(runQuery, start, count)
        .then((result) => {
          if (requestId !== requestIdRef.current) return;

          /*
           * 页码越界自愈。
           *
           * 物品被取走后总数会缩水，当前页可能就**不存在**了——比如你停在第 2 页，
           * 但物品只剩 40 件、总共才 1 页。这时候后端会老老实实返回空列表，
           * 界面就成了"第 2 页 · 空"。所以发现这一页是空的就退回最后一页。
           *
           * 只改页码、不写状态：接着触发的那次查询会写最终结果。
           */
          if (loadMode === 'paged' && result.items.length === 0 && page > 0) {
            // 总数只在第 1 页可信（见 fetchRange），所以这里用已知的那个
            const known = result.total ?? total;
            const lastPage = known !== null && known > 0 ? Math.ceil(known / pageSize) - 1 : 0;
            if (page > lastPage) {
              setPage(lastPage);
              return;
            }
          }

          setItems(result.items);
          // 总数只有"从头取"的那次才知道；第 2 页起沿用上一次的（见 fetchRange）
          if (result.total !== null) setTotal(result.total);
          setHasMore(moreAfter(result));
          setError(null);
        })
        .catch((err: Error) => {
          if (requestId !== requestIdRef.current) return;
          setItems([]);
          setTotal(null);
          setHasMore(false);
          setError(err.message);
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return;
          readyRef.current = true;
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    // 输入变化就取消上一次：清掉定时器（在途请求靠上面的 requestId 丢弃）
    return () => clearTimeout(timer);
  }, [runQuery, loadMode, page, pageSize, reloadToken]);

  /**
   * 无限滚动：往后追加一批。
   *
   * 由列表底部的哨兵元素（`IntersectionObserver`）触发，见 AppShell。
   */
  const loadMore = useCallback(() => {
    if (!hasMore || !readyRef.current || appendingRef.current) return;

    appendingRef.current = true;
    setLoadingMore(true);

    // ⚠️ 这里**不能**让 requestId 自增：追加是"接着上一批"，不是"重来一次"。
    //    记下当前的号，只用于在响应回来时确认"列表还没被换掉"。
    const requestId = requestIdRef.current;
    const offset = itemsRef.current.length;

    fetchRange(runQuery, offset, pageSize)
      .then((result) => {
        if (requestId !== requestIdRef.current) return;
        setItems((prev) => [...prev, ...result.items]);
        // 追加请求的 offset > 0，后端给的总数不可信，沿用已知的（见 fetchRange）
        if (result.total !== null) setTotal(result.total);
        setHasMore(moreAfter(result));
      })
      .catch((err: Error) => {
        if (requestId !== requestIdRef.current) return;
        setError(err.message);
      })
      .finally(() => {
        appendingRef.current = false;
        setLoadingMore(false);
      });
  }, [hasMore, runQuery, pageSize]);

  // 线 B（B2）：订阅后端的 `itemsChanged` / `maintenance` 推送。这是"在游戏里
  // 捡到东西，网页上立刻出现"的正常路径。连接由 connectLive 负责自动重连。
  useEffect(() => {
    return connectLive({
      onItemsChanged: reload,
      onMaintenance: (state) => setMaintenance(state.active ? state : null),
      onNotification: (n) => pushToast(n.message, n.level, n.helpUrl, n.fade),
      onStatus: setLive,
    });
  }, [reload, pushToast]);

  // 初次加载时补一次状态：维护只在**状态变化**时广播，所以如果页面是在
  // 维护开始之后才打开的，就永远收不到那条推送（只会看到一堆 503）。
  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((health) => {
        if (cancelled || !health.maintenance) return;

        // 带上进度字段，这样在维护中途打开页面也能看到"到哪一步了"
        setMaintenance({
          active: true,
          message: health.maintenanceMessage ?? '正在更新游戏数据库…',
          ...health.maintenanceState,
        });
      })
      .catch(() => {
        /* 忽略：连不上后端时下面的查询自己会报错 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 兜底：只有在 /ws 断开时才轮询（见 POLL_INTERVAL_MS 注释）。
  // 窗口重新获得焦点时也立刻查一次——那时可能刚重连上，推送已经错过了。
  // 维护期间不轮询：后端会一直回 503，白白刷屏。
  useEffect(() => {
    if (live || maintenance) return;

    let cancelled = false;

    const check = () => {
      if (document.visibilityState !== 'visible') return;

      // 只取 1 件，只为拿到 total
      fetchItems(0, 1)
        .then((res) => {
          if (cancelled) return;
          const previous = knownTotalRef.current;
          knownTotalRef.current = res.total;
          if (previous !== null && previous !== res.total) {
            reload();
          }
        })
        .catch(() => {
          /* 忽略：轮询失败不该弹错误（后端重启期间很常见） */
        });
    };

    check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [live, maintenance, reload]);

  return (
    <ItemDetailProvider onTransferred={reload}>
      <I18nProvider map={i18n}>
        <AppShell
          tab={tab}
          onTabChange={setTab}
          keyword={keyword}
          onKeywordChange={setKeyword}
          viewId={viewId}
          onViewChange={setViewId}
          items={items}
          total={total}
          loading={loading}
          error={error}
          onReload={reload}
          toasts={toasts}
          onDismissToast={dismissToast}
          maintenance={maintenance}
          paging={{
            loadMode,
            pageSize,
            page,
            hasMore,
            loadingMore,
            setLoadMode,
            setPageSize,
            setPage,
            loadMore,
          }}
        />
      </I18nProvider>
    </ItemDetailProvider>
  );
}
