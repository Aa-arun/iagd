import { useEffect, useState, type ReactNode } from 'react';
import type { FiltersOptions, StatOperator } from '../../api';
import type { FilterControls } from '../../views/useFilters';
import './AdvancedSearch.css';

interface Props {
  options: FiltersOptions | null;
  filters: FilterControls;
}

/**
 * 高级搜索：一个图标按钮，点开是**弹出的配置面板**。
 *
 * ★ 分工：过滤面板管"勾选式"条件（品质/槽位/职业/属性存在性），
 *   这里管需要**输入数值**的那几样（等级区间、属性 ≥/≤、排序）。
 *   两者互不重复，加起来正好是后端 `ItemSearchRequest` 的全部过滤能力。
 */
export default function AdvancedSearch({ options, filters }: Props) {
  const [open, setOpen] = useState(false);
  const { advanced } = filters;
  const stats = options?.stats ?? [];

  // Esc 关闭：弹层挡住了列表，键盘用户得有办法退出来
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const addCondition = () => {
    if (!stats.length) return;
    filters.addNumeric(stats[0].name, 'GreaterOrEqual', 10);
  };

  return (
    <div className="adv-search">
      <button
        type="button"
        className="adv-search__button"
        aria-expanded={open}
        title="高级搜索：等级区间、属性数值、排序"
        onClick={() => setOpen((v) => !v)}
      >
        <TuneIcon />
        {advanced.numeric.length > 0 && <span className="adv-search__badge">{advanced.numeric.length}</span>}
      </button>

      {open && (
        <>
          <div className="adv-search__backdrop" onClick={() => setOpen(false)} />

          <div className="adv-search__popup" role="dialog" aria-label="高级搜索">
            <header className="adv-search__header">
              <h2>高级搜索</h2>
              <button
                type="button"
                className="adv-search__close"
                onClick={() => setOpen(false)}
                title="关闭"
              >
                ×
              </button>
            </header>

            <Row label="等级需求">
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
            </Row>

            <Row label="排序">
              <label className="adv-search__radio">
                <input
                  type="radio"
                  name="adv-sort"
                  checked={!advanced.orderByLevel}
                  onChange={() => filters.setOrderByLevel(false)}
                />
                按名称
              </label>
              <label className="adv-search__radio">
                <input
                  type="radio"
                  name="adv-sort"
                  checked={advanced.orderByLevel}
                  onChange={() => filters.setOrderByLevel(true)}
                />
                按等级需求
              </label>
            </Row>

            <Row label="属性数值" align="top">
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
                  onClick={addCondition}
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
            </Row>
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  align,
  children,
}: {
  label: string;
  align?: 'top';
  children: ReactNode;
}) {
  return (
    <div className="adv-search__row" data-align={align}>
      <span className="adv-search__label">{label}</span>
      <div className="adv-search__control">{children}</div>
    </div>
  );
}

/**
 * 高级搜索图标：三条带滑块的横杆（"精细调节"的通用符号）。
 *
 * 自绘而不是引第三方图标库：项目不引 CSS 框架、也还没引图标库，
 * 为一个按钮加依赖不划算（见 `.docs/14-疑难决定.md`）。
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
