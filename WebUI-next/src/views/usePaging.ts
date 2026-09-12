import { useEffect, useState } from 'react';

/**
 * 物品列表的**加载方式**。
 *
 * - `scroll`：无限滚动——滚到底部自动追加下一批，列表里累积越来越多。
 * - `paged`：翻页——一次只显示一页，底部一排页码控件。
 *
 * 使用者 2026-09-12 要求"两种都要，界面上能切"，所以这是一个可切换的偏好，
 * 与 `useItemView` 的视图选择同一套路（存 localStorage）。
 */
export type LoadMode = 'scroll' | 'paged';

/**
 * 每页（无限滚动模式下是"每批"）的条数档位。
 *
 * ⚠️ **上限不能再往上加**：后端单次请求最多返回 1000 条
 * （C# 的 `PlayerItemDaoImpl.MaxSearchResults`）。真要超过 1000，
 * 得由 `App.tsx` 的 `fetchRange` 分批取，而不是把这里的档位调大。
 */
export const PAGE_SIZES = [50, 100, 200, 500] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

/** localStorage 键名。两个偏好存浏览器本地，不动后端、也不进 settings.json。 */
const MODE_KEY = 'iagd.loadMode';
const SIZE_KEY = 'iagd.pageSize';

const DEFAULT_MODE: LoadMode = 'scroll';
const DEFAULT_SIZE: PageSize = 50;

/** 读偏好。存的值可能被手改坏（或来自旧版本），所以要**校验**再信。 */
function readMode(): LoadMode {
  const raw = localStorage.getItem(MODE_KEY);
  return raw === 'paged' || raw === 'scroll' ? raw : DEFAULT_MODE;
}

function readSize(): PageSize {
  const raw = Number(localStorage.getItem(SIZE_KEY));
  return (PAGE_SIZES as readonly number[]).includes(raw) ? (raw as PageSize) : DEFAULT_SIZE;
}

/**
 * 加载方式 + 每页条数 + 当前页（翻页模式用）+ 持久化。
 *
 * ★ 为什么"改条数/改方式"要顺手把页码归零：
 *   否则会停在一个**不存在的页码**上。比如 66 件物品、每页 50 时有 2 页，
 *   你翻到第 2 页再把每页改成 200 —— 总页数只剩 1 页，页码却还停在 2，
 *   界面会显示"第 2 / 1 页 · 显示 51–66"这种自相矛盾的状态。
 */
export function usePaging() {
  const [loadMode, setLoadMode] = useState<LoadMode>(readMode);
  const [pageSize, setPageSizeRaw] = useState<PageSize>(readSize);
  const [page, setPage] = useState(0);

  useEffect(() => {
    localStorage.setItem(MODE_KEY, loadMode);
  }, [loadMode]);

  useEffect(() => {
    localStorage.setItem(SIZE_KEY, String(pageSize));
  }, [pageSize]);

  const setPageSize = (size: PageSize) => {
    setPageSizeRaw(size);
    setPage(0);
  };

  const changeLoadMode = (mode: LoadMode) => {
    setLoadMode(mode);
    setPage(0);
  };

  return {
    loadMode,
    /** 切换加载方式（会自动回到第 1 页） */
    setLoadMode: changeLoadMode,
    pageSize,
    /** 改每页条数（会自动回到第 1 页） */
    setPageSize,
    /** 当前页，从 0 开始。只对翻页模式有意义 */
    page,
    setPage,
  };
}

/**
 * 工具条与翻页条要用到的全部分页状态 + 回调。
 *
 * 打包成一个对象传递，是为了不让 `AppShell` 凭空多出八个 props——
 * 它们本来就是"同一件事"（当前怎么分页、怎么改）。
 */
export interface PagingState {
  loadMode: LoadMode;
  pageSize: PageSize;
  page: number;
  /** 无限滚动：后面还有没有下一批 */
  hasMore: boolean;
  /** 无限滚动：正在追加下一批 */
  loadingMore: boolean;
  setLoadMode: (mode: LoadMode) => void;
  setPageSize: (size: PageSize) => void;
  setPage: (page: number) => void;
  /** 无限滚动：加载下一批（由列表底部的哨兵触发） */
  loadMore: () => void;
}
