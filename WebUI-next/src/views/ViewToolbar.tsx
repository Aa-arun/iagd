import { useItemDetail } from '../components/ItemDetail';
import {
  ALL_DETAIL_MODES,
  effectiveDetailMode,
  type DetailDisplayMode,
} from '../components/ItemDetail/ItemDetailContext';
import { ITEM_VIEWS, findView } from './registry';
import { PAGE_SIZES, type LoadMode, type PageSize, type PagingState } from './usePaging';
import { SORT_CHOICES, type SortBy, type SortState } from './useSort';
import './ViewToolbar.css';

/** 「详情」下拉里每一项的文案（各视图用到的子集，见 registry 的 detailModes）。 */
const DETAIL_MODE_LABELS: Record<DetailDisplayMode, string> = {
  hover: '浮动',
  'docked-left': '左侧固定栏',
  'docked-right': '右侧固定栏',
  full: '瀑布',
  'fixed-height': '固定高度',
};

interface Props {
  viewId: string;
  onViewChange: (id: string) => void;
  paging: PagingState;
  /** 排序偏好（使用者 2026-09-13 从高级搜索搬到这里） */
  sort: SortState;
}

/**
 * 列表上方的工具条：视图 / 详情 / 排序 / 加载方式 / 每页条数。
 *
 * 它**独立于列表**（在滚动容器外面），所以滚动列表时工具条不动——
 * 这是使用者 2026-09-12 的要求。
 *
 * ★ 2026-09-12 新增后两个下拉：物品变多之后，一屏 50 条是远不够用的。
 *   加载方式与条数是**两个独立的偏好**，故意不合并成一个下拉：
 *   "无限滚动 + 每次 200 条"和"翻页 + 每页 200 条"都是合理组合。
 *
 * ★ 2026-09-13 新增「排序」：它原来是高级搜索里的一对单选（按名称 / 按等级），
 *   使用者要求搬出来、并升级成四个选项（入库时间 / 品质 / 等级 / 名称）。
 *   理由很直白：排序是"怎么看"的一部分，每次都要开高级搜索改太绕。
 */
export default function ViewToolbar({ viewId, onViewChange, paging, sort }: Props) {
  const { displayMode, setDisplayMode } = useItemDetail();
  const view = findView(viewId);
  /*
   * 每个视图允许的详情方式不同（见 types.ts 的 `detailModes`）：
   *   · 分栏列表 → 左 / 右固定栏（浮动会挡住相邻行）
   *   · 简洁卡片 → 浮动 + 左 / 右固定栏
   *   · 详细对照 → 卡片**布局**：瀑布（瀑布流）/ 固定高度（等高、内部滚动）
   * 只有"一种选项都没有"的视图才禁用这个下拉。
   */
  const detailModes = view.detailModes ?? ALL_DETAIL_MODES;
  const detailDisabled = detailModes.length === 0;
  const activeDetailMode = effectiveDetailMode(displayMode, detailModes);
  const { loadMode, pageSize, setLoadMode, setPageSize } = paging;
  const sortHint = SORT_CHOICES.find((choice) => choice.value === sort.sortBy)?.hint;

  return (
    <div className="view-toolbar">
      <label className="view-toolbar__label" htmlFor="view-select">
        视图
      </label>
      <select
        id="view-select"
        className="view-toolbar__select"
        value={view.id}
        onChange={(e) => onViewChange(e.target.value)}
      >
        {ITEM_VIEWS.map((v) => (
          <option key={v.id} value={v.id} title={v.description}>
            {v.label}
          </option>
        ))}
      </select>

      <label className="view-toolbar__label" htmlFor="detail-mode-select">
        详情
      </label>
      <select
        id="detail-mode-select"
        className="view-toolbar__select view-toolbar__select--narrow"
        value={activeDetailMode}
        disabled={detailDisabled}
        onChange={(e) => setDisplayMode(e.target.value as DetailDisplayMode)}
        title={
          detailDisabled
            ? '这个视图没有可选的详情方式'
            : view.showsFullStats
              ? '卡片怎么排：瀑布（高度随内容、各列错落）/ 固定高度（上限 = 内容区的 0.85，超出时卡片内滚动）'
              : '详情面板显示在哪：跟随鼠标浮动，或在左侧 / 右侧固定一栏'
        }
      >
        {detailModes.map((mode) => (
          <option key={mode} value={mode}>
            {DETAIL_MODE_LABELS[mode]}
          </option>
        ))}
      </select>

      <label className="view-toolbar__label" htmlFor="sort-select">
        排序
      </label>
      <select
        id="sort-select"
        className="view-toolbar__select view-toolbar__select--narrow"
        value={sort.sortBy}
        onChange={(e) => sort.setSortBy(e.target.value as SortBy)}
        title={sortHint ?? '选择列表的排列次序'}
      >
        {SORT_CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value} title={choice.hint}>
            {choice.label}
          </option>
        ))}
      </select>

      <label className="view-toolbar__label" htmlFor="load-mode-select">
        加载
      </label>
      <select
        id="load-mode-select"
        className="view-toolbar__select"
        value={loadMode}
        onChange={(e) => setLoadMode(e.target.value as LoadMode)}
        title="无限滚动：滚到列表底部自动续下一批；翻页：一次只显示一页，列表下方出现页码"
      >
        <option value="scroll">无限滚动</option>
        <option value="paged">翻页</option>
      </select>

      {/*
        label 随模式变：翻页模式下它决定"一页多少条"，无限滚动模式下
        决定"一次续多少条"。叫法不同，免得看的人以为滚动的也是"页"。
      */}
      <label className="view-toolbar__label" htmlFor="page-size-select">
        {loadMode === 'paged' ? '每页' : '每批'}
      </label>
      <select
        id="page-size-select"
        className="view-toolbar__select view-toolbar__select--narrow"
        value={pageSize}
        onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n} 条
          </option>
        ))}
      </select>
    </div>
  );
}
