import { useMemo, type ReactNode } from 'react';
import type { FiltersOptions, SlotGroup } from '../../api';
import { CLASS_GROUP, RECENT_CHOICES, type FilterControls, type FilterMode } from '../../views/useFilters';
import './chips.css';

/**
 * 过滤选项的色块与成行的渲染。
 *
 * ★ 抽成共享组件的原因：**过滤面板**与**高级搜索**要显示同一批选项、共享同一份勾选状态
 * （在面板里勾"火焰"，打开高级搜索必须也是勾着的）。两份实现迟早会漂移。
 *
 * 颜色即逻辑：黄 = **与**（同时满足），绿 = **或**（任意一个）。
 */

/**
 * 单选用的色块：与多选色块同一套观感，但一组里只有一个能选中。
 * 选中用绿——这些选项之间都是"或"（选了"一天内"就不可能是"一周内"）。
 */
export function ChipRadio({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`filter-chip${checked ? ' filter-chip--or' : ''}`}
      aria-pressed={checked}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}

/**
 * 入库时间：**单选**（五小时内 / 一天内 / 一周内 / 一月内）。
 *
 * - **不选就是不限**（所以没有"不限"这一档）；再点一下已选中的即取消。
 * - 选中用**黄**而不是绿：这几个档位虽然互斥，但它们的语义不是"或"
 *   （使用者 2026-09-13 指定）。
 */
export function RecentRow({ filters }: { filters: FilterControls }) {
  const current = filters.advanced.recentHours;

  return (
    <Row label="入库时间">
      {RECENT_CHOICES.map((choice) => (
        <Chip
          key={choice.hours}
          label={choice.label}
          mode={current === choice.hours ? 'and' : undefined}
          onClick={() => filters.setRecentHours(current === choice.hours ? 0 : choice.hours)}
          title={current === choice.hours ? '再点一下取消（不限时间）' : `${choice.label}内入库的`}
        />
      ))}
    </Row>
  );
}

/** 一个色块。`mode` 决定颜色与凹凸：未传 = 未选中（阳刻），`and` / `or` = 选中（阴刻）。 */
export function Chip({
  label,
  mode,
  onClick,
  title,
}: {
  label: string;
  mode?: FilterMode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`filter-chip${mode ? ` filter-chip--${mode}` : ''}`}
      aria-pressed={mode !== undefined}
      onClick={onClick}
      title={title ?? label}
    >
      {label}
    </button>
  );
}

/**
 * 一行：左侧分区名，右侧流式排列的选项。
 *
 * 分区名有三种形态：
 * - 给了 `onToggleMode`：**点一下切换整组逻辑**，名字本身就是黄/绿的状态指示
 * - 给了 `onSelectAll`：点一下全选 / 全不选（槽位那四组用）
 * - 都没给：纯文字标签（品质、职业）
 */
export function Row({
  label,
  mode,
  onToggleMode,
  onSelectAll,
  children,
}: {
  label: string;
  mode?: FilterMode;
  onToggleMode?: () => void;
  onSelectAll?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="filter-row">
      {onToggleMode ? (
        <button
          type="button"
          className={`filter-row__label filter-row__label--mode filter-row__label--${mode ?? 'and'}`}
          onClick={onToggleMode}
          title={
            mode === 'or'
              ? '整组是「或」：满足任意一个即可。点击改成「与」'
              : '整组是「与」：必须同时满足。点击改成「或」'
          }
        >
          {label}
        </button>
      ) : onSelectAll ? (
        <button
          type="button"
          className="filter-row__label filter-row__label--clickable"
          onClick={onSelectAll}
          title="全选 / 全不选"
        >
          {label}
        </button>
      ) : (
        <span className="filter-row__label">{label}</span>
      )}
      <div className="filter-row__chips">{children}</div>
    </div>
  );
}

/** 品质。key 是"值:词缀数"——"双稀有"与"稀有"都是 `Green`，只靠值区分不开。 */
export function QualityRow({ options, filters }: { options: FiltersOptions | null; filters: FilterControls }) {
  const qualities = useMemo(
    () => (options?.qualities ?? []).map((q) => ({ key: `${q.value}:${q.prefixRarity}`, label: q.label })),
    [options],
  );

  return (
    <Row label="品质">
      {qualities.map((q) => (
        <Chip
          key={q.key}
          label={q.label}
          mode={filters.selected.rarities.includes(q.key) ? 'or' : undefined}
          onClick={() => filters.toggleRarity(q.key)}
        />
      ))}
    </Row>
  );
}

/**
 * 槽位四组（护甲 / 武器 / 首饰 / 物品）。组名可点 = 全选 / 全不选。
 *
 * ★ 首饰与物品**并到同一行**：它们分别只有 3、4 项，各占一行太浪费纵向空间
 * （使用者 2026-09-13 要求）。两组的"全选"仍然是各自独立的。
 */
export function SlotRows({ options, filters }: { options: FiltersOptions | null; filters: FilterControls }) {
  const groups = options?.slotGroups ?? [];
  const combined = groups.filter((g) => g.id === 'jewelry' || g.id === 'item');
  const alone = groups.filter((g) => g.id !== 'jewelry' && g.id !== 'item');

  return (
    <>
      {alone.map((group) => (
        <SlotRow key={group.id} groups={[group]} filters={filters} />
      ))}
      {combined.length > 0 && <SlotRow groups={combined} filters={filters} />}
    </>
  );
}

/** 一行槽位。`groups` 多于一个时，它们的选项排在一起，但全选按钮各自独立。 */
function SlotRow({ groups, filters }: { groups: SlotGroup[]; filters: FilterControls }) {
  const select = (group: SlotGroup) => {
    const all = group.items.every((item) => filters.selected.slots.includes(item.value));
    filters.setSlots(group.items.map((i) => i.value), !all);
  };

  return (
    <div className="filter-row">
      <span className={`filter-row__label${groups.length > 1 ? ' filter-row__label--multi' : ''}`}>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className="filter-row__label-btn"
            onClick={() => select(group)}
            title="全选 / 全不选"
          >
            {group.label}
          </button>
        ))}
      </span>

      <div className="filter-row__chips">
        {groups.flatMap((group) =>
          group.items.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              mode={filters.selected.slots.includes(item.value) ? 'or' : undefined}
              onClick={() => filters.toggleSlot(item.value)}
              title={item.inverse ? '排除全部装备，只留下物品（兜住分类的遗漏）' : item.label}
            />
          )),
        )}
      </div>
    </div>
  );
}

/** 职业。只列十个基础职业。 */
export function ClassRow({ options, filters }: { options: FiltersOptions | null; filters: FilterControls }) {
  // 职业也用"组级逻辑"：与 = 装备同时加成这些职业，或 = 加成其中任意一个
  const mode = filters.selected.groupModes[CLASS_GROUP] ?? 'and';

  return (
    <Row label="职业" mode={mode} onToggleMode={() => filters.cycleGroupMode(CLASS_GROUP)}>
      {(options?.classes ?? []).map((c) => (
        <Chip
          key={c.value}
          label={c.label}
          mode={filters.selected.classes.includes(c.value) ? mode : undefined}
          onClick={() => filters.toggleClass(c.value)}
        />
      ))}
    </Row>
  );
}

/**
 * 物品属性四组（伤害 / 持续伤害 / 抗性 / 杂项）。
 *
 * ★ **逻辑在组上，不在选项上**：点组名把整组在「与」（黄）和「或」（绿）之间切换，
 * 组里的选项跟着变色。选项本身只有选中/未选两态。
 *
 *   组是「与」：选了元素和物理 → 同时有这两种伤害的装备
 *   组是「或」：选了元素和物理 → 有元素**或**物理伤害的装备
 *
 * ⚠️ 开关类（已镶嵌、战宠…）固定按「与」处理——它们各自是独立的布尔，没有"或"可言，
 *    所以颜色也固定是黄。
 */
export function GroupRows({ options, filters }: { options: FiltersOptions | null; filters: FilterControls }) {
  const { selected } = filters;

  return (
    <>
      {(options?.groups ?? []).map((group) => {
        const mode = selected.groupModes[group.id] ?? 'and';

        return (
          <Row
            key={group.id}
            label={group.label}
            mode={mode}
            onToggleMode={() => filters.cycleGroupMode(group.id)}
          >
            {group.items.map((item) => (
              <Chip
                key={item.id}
                label={item.label}
                mode={
                  selected.items.includes(item.id)
                    ? item.kind === 'flag'
                      ? 'and'
                      : mode
                    : undefined
                }
                onClick={() => filters.toggleItem(item.id)}
              />
            ))}
          </Row>
        );
      })}
    </>
  );
}
