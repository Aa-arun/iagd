import { useItemDetail } from '../components/ItemDetail';
import { ITEM_VIEWS, findView } from './registry';
import type { DetailDisplayMode } from '../components/ItemDetail/ItemDetailContext';
import { PAGE_SIZES, type LoadMode, type PageSize, type PagingState } from './usePaging';
import './ViewToolbar.css';

interface Props {
  viewId: string;
  onViewChange: (id: string) => void;
  paging: PagingState;
}

/**
 * 列表上方的工具条：视图 / 详情 / 加载方式 / 每页条数。
 *
 * 它**独立于列表**（在滚动容器外面），所以滚动列表时工具条不动——
 * 这是使用者 2026-09-12 的要求。
 *
 * ★ 2026-09-12 新增后两个下拉：物品变多之后，一屏 50 条是远不够用的。
 *   加载方式与条数是**两个独立的偏好**，故意不合并成一个下拉：
 *   "无限滚动 + 每次 200 条"和"翻页 + 每页 200 条"都是合理组合。
 */
export default function ViewToolbar({ viewId, onViewChange, paging }: Props) {
  const { displayMode, setDisplayMode } = useItemDetail();
  const view = findView(viewId);
  // 这种视图自己就把完整属性摊开了，"详情"下拉没有意义 → 禁用（见 types.ts 的说明）
  const detailDisabled = view.showsFullStats === true;
  const { loadMode, pageSize, setLoadMode, setPageSize } = paging;

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
        value={displayMode}
        disabled={detailDisabled}
        onChange={(e) => setDisplayMode(e.target.value as DetailDisplayMode)}
        title={
          detailDisabled
            ? '「详细对照」视图已经把完整属性摊开了，不需要详情面板'
            : '跟随鼠标浮动，或在左侧/右侧固定一栏'
        }
      >
        <option value="hover">浮动</option>
        <option value="docked-left">左侧固定栏</option>
        <option value="docked-right">右侧固定栏</option>
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
