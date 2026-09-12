import { useEffect, useState, type ReactNode } from 'react';
import type { FiltersOptions, StatOperator } from '../../api';
import { EMPTY_SELECTED, countFilters, type FilterControls } from '../../views/useFilters';
import { ChipRadio, ClassRow, GroupRows, QualityRow, RecentRow, Row, SlotRows } from '../Filters/chips';
import './AdvancedSearch.css';

interface Props {
  options: FiltersOptions | null;
  filters: FilterControls;
}

/**
 * 高级搜索：搜索框右边一个图标按钮，点开是**完整的筛选配置**。
 *
 * ★ 与过滤面板的关系：两者**共享同一份状态**——在这里勾"火焰"，面板上也亮着。
 *   区别只是排布：面板是常驻的快速勾选，这里是完整版（多了等级区间、属性数值、
 *   入库时间、排序），按分区组织、一次看一块。
 *
 * 信息架构参考了 grimtools 的高级搜索面板，但只保留我们真正有的条目
 * （武器每秒攻击次数、护甲格挡、套装、扩展包这些我们都没有）。
 */
export default function AdvancedSearch({ options, filters }: Props) {
  const [open, setOpen] = useState(false);
  const { advanced } = filters;
  const stats = options?.stats ?? [];

  // 角标只数"高级搜索独有"的那几项，不含与面板共用的勾选
  const badge = countFilters(EMPTY_SELECTED, advanced);

  // Esc 关闭：这是个挡住了整个列表的模态
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="adv-search__button"
        onClick={() => setOpen(true)}
        title="高级搜索：类型、稀有度、职业、属性数值、需求"
      >
        <TuneIcon />
        {badge > 0 && <span className="adv-search__badge">{badge}</span>}
      </button>

      {open && (
        <div className="adv-search__overlay" onClick={() => setOpen(false)}>
          <div
            className="adv-search__dialog"
            role="dialog"
            aria-modal="true"
            aria-label="高级搜索"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="adv-search__header">
              <h2>高级搜索</h2>
              <button type="button" className="adv-search__close" onClick={() => setOpen(false)} title="关闭">
                ×
              </button>
            </header>

            <div className="adv-search__body">
              <Section title="类型">
                <SlotRows options={options} filters={filters} />
              </Section>

              <Section title="稀有度">
                <QualityRow options={options} filters={filters} />
              </Section>

              <Section title="职业">
                <ClassRow options={options} filters={filters} />
              </Section>

              <Section title="物品属性">
                <GroupRows options={options} filters={filters} />
              </Section>

              <Section title="属性数值">
                <div className="adv-search__conditions">
                  {advanced.numeric.map((condition) => (
                    <div key={condition.id} className="adv-condition">
                      <select
                        className="adv-condition__stat"
                        value={condition.stat}
                        onChange={(e) => filters.updateNumeric(condition.id, { stat: e.target.value })}
                      >
                        {stats.map((stat) => (
                          <option key={stat.name} value={stat.name}>
                            {stat.label}
                          </option>
                        ))}
                      </select>

                      <select
                        className="adv-condition__op"
                        value={condition.operator}
                        onChange={(e) =>
                          filters.updateNumeric(condition.id, { operator: e.target.value as StatOperator })
                        }
                      >
                        {(options?.operators ?? []).map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        className="adv-condition__value"
                        value={condition.threshold}
                        onChange={(e) =>
                          filters.updateNumeric(condition.id, { threshold: Number(e.target.value) || 0 })
                        }
                      />

                      <button
                        type="button"
                        className="adv-condition__remove"
                        title="删除这条条件"
                        onClick={() => filters.removeNumeric(condition.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="adv-search__add"
                    onClick={() => stats.length && filters.addNumeric(stats[0].name, 'GreaterOrEqual', 10)}
                    disabled={!stats.length}
                  >
                    + 添加条件
                  </button>

                  {!stats.length && (
                    <p className="adv-search__hint">
                      暂无可选属性：后端还在后台计算物品属性，过一会儿再打开。
                    </p>
                  )}
                </div>
              </Section>

              <Section title="需求">
                <div className="adv-search__inline">
                  <span className="adv-search__inline-label">物品等级</span>
                  <input
                    type="number"
                    className="adv-search__number"
                    min={0}
                    max={120}
                    placeholder="不限"
                    value={advanced.minLevel || ''}
                    onChange={(e) => filters.setLevels(Number(e.target.value) || 0, advanced.maxLevel)}
                  />
                  <span className="adv-search__dash">–</span>
                  <input
                    type="number"
                    className="adv-search__number"
                    min={0}
                    max={120}
                    placeholder="不限"
                    value={advanced.maxLevel || ''}
                    onChange={(e) => filters.setLevels(advanced.minLevel, Number(e.target.value) || 0)}
                  />
                </div>
              </Section>

              <Section title="其他">
                <RecentRow filters={filters} />
                <Row label="排序">
                  <ChipRadio
                    label="按名称"
                    checked={!advanced.orderByLevel}
                    onSelect={() => filters.setOrderByLevel(false)}
                  />
                  <ChipRadio
                    label="按等级需求"
                    checked={advanced.orderByLevel}
                    onSelect={() => filters.setOrderByLevel(true)}
                  />
                </Row>
              </Section>
            </div>

            <footer className="adv-search__footer">
              <button type="button" className="adv-search__reset" onClick={filters.clear}>
                重置全部
              </button>
              <button type="button" className="adv-search__done" onClick={() => setOpen(false)}>
                完成
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

/** 一个分区：标题 + 内容。 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="adv-section">
      <h3 className="adv-section__title">{title}</h3>
      <div className="adv-section__body">{children}</div>
    </section>
  );
}

/**
 * 高级搜索图标：三条带滑块的横杆（"精细调节"的通用符号）。
 *
 * 自绘而不是引图标库：项目不引 CSS 框架、也还没引图标库，
 * 为一个按钮加依赖不划算（见 `.docs/14-疑难决定.md` §1）。
 */
function TuneIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M2 4.5h12M2 8h12M2 11.5h12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="6" cy="4.5" r="1.9" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.9" fill="currentColor" />
      <circle cx="5" cy="11.5" r="1.9" fill="currentColor" />
    </svg>
  );
}
