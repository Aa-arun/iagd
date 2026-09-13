import { useEffect, type ReactNode } from 'react';
import type { FiltersOptions } from '../../api';
import type { FilterControls } from '../../views/useFilters';
import type { PagingState } from '../../views/usePaging';
import type { SortState } from '../../views/useSort';
import ViewToolbar from '../../views/ViewToolbar';
import { ClassRow, GroupRows, QualityRow, RecentRow, SlotRows } from '../Filters/chips';
import '../AdvancedSearch/AdvancedSearch.css';
import './FilterDialog.css';

interface Props {
  options: FiltersOptions | null;
  filters: FilterControls;
  viewId: string;
  onViewChange: (id: string) => void;
  paging: PagingState;
  sort: SortState;
  onClose: () => void;
}

/**
 * 专注模式下的「过滤器 / 视图」对话框（快捷键 f）。
 *
 * ★ 为什么专注模式里 f 不再是"开合过滤面板"：
 *   专注模式把整页让给列表（`app__content`），过滤面板和视图工具条都被藏起来了。
 *   这时候需要的是一个**和高级搜索同款**的居中弹窗，一次性把"过滤器 + 怎么看"
 *   都摆出来——使用者 2026-09-13 原话："把过滤器和 view-toolbar 都放到里面"。
 *
 * ★ 这里的勾选**实时生效**（和列表上方的过滤面板一样），不像高级搜索那样有草稿：
 *   它本来就是"过滤器"，不是"搜索条件"。关掉弹窗即完成。
 */
export default function FilterDialog({
  options,
  filters,
  viewId,
  onViewChange,
  paging,
  sort,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // c = 清除过滤器的全部条件（与主界面那个 c 同一个动作）
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        filters.clear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, filters]);

  return (
    <div className="adv-search__overlay" onClick={onClose}>
      <div
        className="adv-search__dialog filter-dialog__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="过滤器与视图"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="adv-search__header">
          <h2>过滤器与视图</h2>
          <button type="button" className="adv-search__close" onClick={onClose} title="关闭（Esc）">
            ×
          </button>
        </header>

        <div className="adv-search__body">
          <Section title="视图">
            {/* 专注模式下工具条被藏起来了，但"怎么看"仍然要能改 */}
            <ViewToolbar viewId={viewId} onViewChange={onViewChange} paging={paging} sort={sort} />
          </Section>

          {!options ? (
            <p className="filter-panel__hint">正在读取可选项…</p>
          ) : (
            <>
              <Section title="稀有度">
                <QualityRow options={options} filters={filters} />
              </Section>
              <Section title="类型">
                <SlotRows options={options} filters={filters} />
              </Section>
              <Section title="职业">
                <ClassRow options={options} filters={filters} />
              </Section>
              <Section title="物品属性">
                <GroupRows options={options} filters={filters} />
              </Section>
              <Section title="入库时间">
                <RecentRow filters={filters} />
              </Section>
            </>
          )}
        </div>

        <footer className="adv-search__footer">
          <button
            type="button"
            className="adv-search__reset"
            onClick={filters.clear}
            title="清除全部过滤条件"
          >
            清除过滤
          </button>
          <button type="button" className="adv-search__done" onClick={onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}

/** 一个分区：标题 + 内容（与高级搜索同款观感）。 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="adv-section">
      <h3 className="adv-section__title">{title}</h3>
      <div className="adv-section__body">{children}</div>
    </section>
  );
}
