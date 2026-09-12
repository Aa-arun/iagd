import { useState } from 'react';
import type { FiltersOptions } from '../../api';
import { countFilters, type FilterControls } from '../../views/useFilters';
import { ClassRow, GroupRows, QualityRow, RecentRow, SlotRows } from '../Filters/chips';
import './FilterPanel.css';

interface Props {
  /** 可选项。`null` = 还在读（后端刚起来时会有这一小段） */
  options: FiltersOptions | null;
  filters: FilterControls;
}

/**
 * 过滤面板：列表上方**可折叠**的一栏。
 *
 * 收起时只留标题、"已选 N 项"和一键清除 —— 主界面以列表为主，面板不能一直占着高度；
 * 但"当前有没有过滤在生效"必须一眼看到，否则会出现"为什么只剩 3 件"的困惑。
 *
 * 选项的渲染与语义（黄 = 与、绿 = 或）在 `components/Filters/chips.tsx`，
 * 与高级搜索共用同一份状态。
 */
export default function FilterPanel({ options, filters }: Props) {
  const [open, setOpen] = useState(false);
  const count = countFilters(filters.selected, filters.advanced);

  return (
    <section className="filter-panel">
      <div className="filter-panel__head">
        <button
          type="button"
          className="filter-panel__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="filter-panel__caret" data-open={open || undefined}>
            ▸
          </span>
          过滤器
          {count > 0 && <span className="filter-panel__count">{count}</span>}
        </button>

        <button
          type="button"
          className="filter-panel__clear"
          onClick={filters.clear}
          disabled={count === 0}
          title="清除全部过滤条件（搜索框里的关键词不受影响）"
        >
          清除
        </button>

        {open && (
          <span className="filter-panel__legend">
            <i className="filter-chip filter-chip--and">与</i>
            <span>同时满足</span>
            <i className="filter-chip filter-chip--or">或</i>
            <span>满足任意一个</span>
          </span>
        )}
      </div>

      {open && (
        <div className="filter-panel__body">
          {!options ? (
            <p className="filter-panel__hint">正在读取可选项…</p>
          ) : (
            <>
              <QualityRow options={options} filters={filters} />
              <SlotRows options={options} filters={filters} />
              <ClassRow options={options} filters={filters} />
              <GroupRows options={options} filters={filters} />
              {/* 入库时间放最后：它是对"什么时候入库"的筛选，与上面那些属性条件不同类 */}
              <RecentRow filters={filters} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
