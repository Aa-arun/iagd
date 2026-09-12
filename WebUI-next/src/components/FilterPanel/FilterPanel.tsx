import { useMemo, useState, type ReactNode } from 'react';
import type { FiltersOptions } from '../../api';
import { countFilters, type FilterControls } from '../../views/useFilters';
import './FilterPanel.css';

interface Props {
  /** 可选项。`null` = 还在读（后端刚起来时会有这一小段） */
  options: FiltersOptions | null;
  filters: FilterControls;
}

/**
 * 过滤面板。
 *
 * 内容是**折叠**的：收起时只留一行标题、"已选 N 项"和一键清除 ——
 * 主界面以列表为主，面板不能一直占着高度；但"当前有没有过滤在生效"必须一眼看到，
 * 否则会出现"为什么只剩 3 件"的困惑。
 *
 * 选项不用复选框，而是**圆角矩形的色块**：选中时变色 + 压成阴刻，未选中是阳刻。
 */
export default function FilterPanel({ options, filters }: Props) {
  const [open, setOpen] = useState(false);
  const { selected, advanced } = filters;

  const count = countFilters(selected, advanced);

  /*
   * 品质去重：后端为了兼容旧界面的"1 / 2 个绿色词缀"细分，会把 `Green` 返回三次
   * （用 `prefixRarity` 区分）。但多选品质用的是 `rarities` 数组，那个细分字段是单值、
   * 与多选不兼容，所以面板里只保留每个品质值的一项。
   */
  const qualities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const q of options?.qualities ?? []) {
      if (!seen.has(q.value)) seen.set(q.value, q.label);
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [options]);

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
      </div>

      {open && (
        <div className="filter-panel__body">
          {!options ? (
            <p className="filter-panel__hint">正在读取可选项…</p>
          ) : (
            <>
              <Group label="品质">
                {qualities.map((q) => (
                  <Chip
                    key={q.value}
                    label={q.label}
                    active={selected.rarities.includes(q.value)}
                    onClick={() => filters.toggleRarity(q.value)}
                  />
                ))}
              </Group>

              <Group label="槽位">
                {options.slots.map((s) => (
                  <Chip
                    key={s.value}
                    label={s.label}
                    active={selected.slots.includes(s.value)}
                    onClick={() => filters.toggleSlot(s.value)}
                  />
                ))}
              </Group>

              <Group label="职业">
                {options.classes.map((c) => (
                  <Chip
                    key={c.value}
                    label={c.label}
                    active={selected.classes.includes(c.value)}
                    onClick={() => filters.toggleClass(c.value)}
                  />
                ))}
              </Group>

              {options.groups.map((group) => (
                <Group key={group.id} label={group.label}>
                  {group.items.map((item) => (
                    <Chip
                      key={item.id}
                      label={item.label}
                      active={selected.items.includes(item.id)}
                      onClick={() => filters.toggleItem(item.id)}
                    />
                  ))}
                </Group>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** 一行：左侧分区名，右侧流式排列的选项。 */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="filter-panel__group">
      <span className="filter-panel__group-label">{label}</span>
      <div className="filter-panel__chips">{children}</div>
    </div>
  );
}

/** 一个颜色块。选中 = 变色 + 阴刻（凹陷），未选中 = 阳刻（凸起）。 */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={active ? 'filter-chip filter-chip--on' : 'filter-chip'}
      aria-pressed={active}
      onClick={onClick}
      title={label}
    >
      {label}
    </button>
  );
}
