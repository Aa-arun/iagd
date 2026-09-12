import { useItemDetail } from '../components/ItemDetail';
import { ITEM_VIEWS, findView } from './registry';
import type { DetailDisplayMode } from '../components/ItemDetail/ItemDetailContext';
import './ViewToolbar.css';

interface Props {
  viewId: string;
  onViewChange: (id: string) => void;
}

/**
 * 列表上方的工具条：视图选择 + 详情显示方式。
 *
 * 它**独立于列表**（在滚动容器外面），所以滚动列表时工具条不动——
 * 这是使用者 2026-09-12 的要求。
 */
export default function ViewToolbar({ viewId, onViewChange }: Props) {
  const { displayMode, setDisplayMode } = useItemDetail();
  const view = findView(viewId);

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
        onChange={(e) => setDisplayMode(e.target.value as DetailDisplayMode)}
        title="跟随鼠标浮动，或在左侧/右侧固定一栏"
      >
        <option value="hover">浮动</option>
        <option value="docked-left">左侧固定栏</option>
        <option value="docked-right">右侧固定栏</option>
      </select>
    </div>
  );
}
