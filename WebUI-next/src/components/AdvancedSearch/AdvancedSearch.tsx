import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { FiltersOptions, StatOperator } from '../../api';
import {
  cloneFilterState,
  useFilterState,
  type FilterApi,
  type FilterState,
} from '../../views/useFilters';
import { isTypingTarget } from '../../prefs/UiPrefs';
import { ClassRow, GroupRows, QualityRow, RecentRow, SlotRows } from '../Filters/chips';
import './AdvancedSearch.css';

/**
 * 高级搜索：搜索框右边一个图标按钮，点开是**完整的搜索配置**。
 *
 * ★ 2026-09-13 使用者澄清了它的定位（这是关键）：
 *
 *   高级搜索里的那些选项**不是过滤器**，而是**搜索条件的一部分**。
 *   勾"穿刺伤害"就等于搜「某某装备 AND 穿刺伤害」——它只决定**搜出来什么**，
 *   和过滤面板**没有关系**、不会去改过滤器的配置。
 *   搜出来的结果，你可以再用过滤器进一步筛。
 *
 *   所以状态是**两套**（`useSearchConditions` / `useFilters`），请求里合并成
 *   一个 `ItemSearchRequest`（两类条件之间是 AND，见 `buildSearchRequest`）。
 *
 * ★ 模态内是**草稿态**：打开时复制一份，点「完成」才写回搜索条件；
 *   「取消」/×/Esc 丢弃。快捷键：Enter = 完成、c = 重置全部、Esc = 取消。
 */

/** 工具条上的入口按钮（模态由 `AppShell` 单独渲染，专注模式下也要能开）。 */
export function AdvancedSearchButton({ badge, onClick }: { badge: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className="adv-search__button"
      onClick={onClick}
      title="高级搜索：把类型、稀有度、职业、属性数值等条件加进搜索"
    >
      <TuneIcon />
      {badge > 0 && <span className="adv-search__badge">{badge}</span>}
    </button>
  );
}

interface DialogProps {
  options: FiltersOptions | null;
  /** 搜索条件的主状态：草稿从它复制，点「完成」再整体写回 */
  search: FilterApi;
  keyword: string;
  onApply: (keyword: string, next: FilterState) => void;
  onClose: () => void;
}

export function AdvancedSearchDialog({ options, search, keyword, onApply, onClose }: DialogProps) {
  /** 草稿：一份独立的搜索条件，改动不碰主状态 */
  const draft: FilterApi = useFilterState(
    cloneFilterState({ selected: search.selected, advanced: search.advanced }),
  );
  const [draftKeyword, setDraftKeyword] = useState(keyword);

  const { clear } = draft;
  const stats = options?.stats ?? [];

  /** 提交草稿：关键词 + 全部搜索条件一起生效 */
  const apply = useCallback(() => {
    onApply(draftKeyword, { selected: draft.selected, advanced: draft.advanced });
  }, [draftKeyword, draft.selected, draft.advanced, onApply]);

  // 键盘：Esc 取消 / Enter 完成 / c 重置全部
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Enter') {
        // 焦点在下拉里时 Enter 是在"选中这一项"，别抢它的默认行为
        if ((e.target as HTMLElement | null)?.tagName === 'SELECT') return;
        e.preventDefault();
        apply();
        return;
      }

      // c 只在**没在输入**时当快捷键，否则搜索框里就打不出 c 了
      if (e.key.toLowerCase() === 'c' && !isTypingTarget(e.target)) {
        e.preventDefault();
        clear();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply, onClose, clear]);

  return (
    <div className="adv-search__overlay" onClick={onClose}>
      <div
        className="adv-search__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="高级搜索"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="adv-search__header">
          <h2>高级搜索</h2>
          <button type="button" className="adv-search__close" onClick={onClose} title="关闭（Esc）">
            ×
          </button>
        </header>

        {/* 顶部搜索框：高级搜索本身也是一个完整的搜索栏 */}
        <div className="adv-search__search">
          <input
            type="search"
            className="search-bar__input"
            placeholder="搜索物品名（空格分隔多个关键词，如「神话 面具」）"
            value={draftKeyword}
            onChange={(e) => setDraftKeyword(e.target.value)}
            aria-label="搜索物品"
            autoComplete="off"
            autoFocus
          />
          {draftKeyword && (
            <button
              type="button"
              className="search-bar__clear"
              title="清空"
              aria-label="清空搜索"
              onClick={() => setDraftKeyword('')}
            >
              ×
            </button>
          )}
        </div>

        <p className="adv-search__lead">
          下面的条件会加进搜索：只决定搜出来哪些装备，不会改动过滤器的配置。
          搜到之后回到列表，还能用过滤器继续筛。
        </p>

        <div className="adv-search__body">
          <Section title="类型">
            <SlotRows options={options} filters={draft} />
          </Section>

          <Section title="稀有度">
            <QualityRow options={options} filters={draft} />
          </Section>

          <Section title="职业">
            <ClassRow options={options} filters={draft} />
          </Section>

          <Section title="物品属性">
            <GroupRows options={options} filters={draft} />
          </Section>

          <Section title="属性数值">
            <div className="adv-search__conditions">
              {draft.advanced.numeric.map((condition) => (
                <div key={condition.id} className="adv-condition">
                  <select
                    className="adv-condition__stat"
                    value={condition.stat}
                    onChange={(e) => draft.updateNumeric(condition.id, { stat: e.target.value })}
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
                      draft.updateNumeric(condition.id, { operator: e.target.value as StatOperator })
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
                      draft.updateNumeric(condition.id, { threshold: Number(e.target.value) || 0 })
                    }
                  />

                  <button
                    type="button"
                    className="adv-condition__remove"
                    title="删除这条条件"
                    onClick={() => draft.removeNumeric(condition.id)}
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="adv-search__add"
                onClick={() => stats.length && draft.addNumeric(stats[0].name, 'GreaterOrEqual', 10)}
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
                value={draft.advanced.minLevel || ''}
                onChange={(e) =>
                  draft.setLevels(Number(e.target.value) || 0, draft.advanced.maxLevel)
                }
              />
              <span className="adv-search__dash">–</span>
              <input
                type="number"
                className="adv-search__number"
                min={0}
                max={120}
                placeholder="不限"
                value={draft.advanced.maxLevel || ''}
                onChange={(e) =>
                  draft.setLevels(draft.advanced.minLevel, Number(e.target.value) || 0)
                }
              />
            </div>
          </Section>

          <Section title="入库时间">
            <RecentRow filters={draft} />
          </Section>
        </div>

        <footer className="adv-search__footer">
          <button
            type="button"
            className="adv-search__reset"
            onClick={clear}
            title="清空搜索条件（c）——搜索框里的关键词保留"
          >
            重置全部
          </button>
          <button type="button" className="adv-search__cancel" onClick={onClose}>
            取消
          </button>
          <button type="button" className="adv-search__done" onClick={apply} title="应用这些条件（Enter）">
            完成
          </button>
        </footer>
      </div>
    </div>
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
