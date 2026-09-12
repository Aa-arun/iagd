using System;
using System.Collections.Generic;
using System.Linq;
using IAGrim.Database.Interfaces;
using IAGrim.Utilities;

namespace IAGrim.Services.Filters {

    /// <summary>
    /// `GET /api/filters/options` 的数据源：把"能过滤什么"与"勾了什么对应什么字段"
    /// 一次性交给前端，前端不必自己再抄一份映射（见 <see cref="FilterCatalog"/>）。
    ///
    /// ★ 它同时是搜索框"按属性名找物品"的解析器：`/api/search` 会先问它
    /// "火焰抗性"对应哪些 stat 名，再塞进请求（<c>ItemSearchRequest.WildcardStats</c>）。
    /// 之所以放这里：只有它同时知道人工标签（<c>iatag_ui_*</c>）与语言表里的属性模板。
    /// </summary>
    internal sealed class FilterOptionsService {
        private readonly IComputedItemStatDao _computedItemStatDao;

        public FilterOptionsService(IComputedItemStatDao computedItemStatDao) {
            _computedItemStatDao = computedItemStatDao;
        }

        /// <summary>
        /// 关键词 → stat 名。返回空表示"这句话与属性无关"，调用方应只按名字搜索。
        /// 纯内存查表，不碰数据库。
        /// </summary>
        public IReadOnlyList<string> ResolveKeyword(string? wildcard) {
            return FilterCatalog.ResolveKeyword(wildcard);
        }

        /// <summary>过滤器面板的全部可选项。</summary>
        public object GetOptions() {
            return new {
                qualities = Qualities(),
                slotGroups = SlotGroups(),
                classes = Classes(),
                operators = Operators(),
                groups = Groups(),
                stats = Stats(),
            };
        }

        /// <summary>
        /// 品质。取值照搬 <c>UIHelper.QualityFilter</c>：
        /// 数据库里存的是 <c>Yellow / Green / Blue / Epic</c>
        /// （注意游戏的"传奇"在库里是 <c>Epic</c>，而 <c>Blue</c> 才是游戏里的"史诗"）。
        /// 绿色还有 1/2 个词缀两个变体，靠 <c>prefixRarity</c> 区分。
        /// </summary>
        private static List<object> Qualities() {
            return [
                new { value = "Yellow", label = Label("iatag_rarity_yellow", "Magic"), prefixRarity = 0 },
                new { value = "Green", label = Label("iatag_rarity_green", "Rare"), prefixRarity = 0 },
                // 双稀有 = 绿色物品里带两个词缀的那些（如"萨拉查的王者之剑"）
                new { value = "Green", label = "双稀有", prefixRarity = 2 },
                new { value = "Blue", label = Label("iatag_rarity_blue", "Epic"), prefixRarity = 0 },
                new { value = "Epic", label = Label("iatag_rarity_epic", "Legendary"), prefixRarity = 0 },
            ];
        }

        /// <summary>数值比较符，取值对应 C# 的 <c>StatValueFilter.Op</c>（枚举名直接进 JSON）。</summary>
        private static List<object> Operators() {
            return [
                new { value = "GreaterOrEqual", label = "≥" },
                new { value = "GreaterThan", label = ">" },
                new { value = "LessOrEqual", label = "≤" },
                new { value = "LessThan", label = "<" },
                new { value = "Equal", label = "=" },
            ];
        }

        /// <summary>
        /// 槽位，按护甲 / 武器 / 首饰 / 物品分成四组。
        /// 定义、顺序与显示名都在 <see cref="FilterCatalog.SlotGroups"/>。
        /// </summary>
        private static List<object> SlotGroups() {
            var groups = new List<object>();

            foreach (var group in FilterCatalog.SlotGroups) {
                var items = new List<object>();

                foreach (var slot in group.Slots) {
                    items.Add(new { value = slot.Value, label = slot.Label, inverse = false });
                }

                // "所有物品"：排除全部装备槽位，兜住分类的遗漏
                if (group.Id == "item") {
                    items.Add(new { value = FilterCatalog.AllItemsSlotValue, label = "所有物品", inverse = true });
                }

                groups.Add(new { id = group.Id, label = group.Label, items });
            }

            return groups;
        }

        /// <summary>职业。十个基础职业，顺序与命名见 <see cref="FilterCatalog.BaseClasses"/>。</summary>
        private static List<object> Classes() {
            return FilterCatalog.BaseClasses
                .Select(c => (object)new { value = c.Value, label = c.Label })
                .ToList();
        }

        /// <summary>分组复选框。定义来自 <see cref="FilterCatalog"/>（照搬旧 WinForms 面板）。</summary>
        private static List<object> Groups() {
            return FilterCatalog.Groups.Select(g => (object)new {
                id = g.Id,
                labelTag = g.LabelTag,
                label = FilterCatalog.ResolveLabel(g.LabelTag, g.FallbackLabel),
                items = g.Items.Select(i => new {
                    id = i.Id,
                    labelTag = i.LabelTag,
                    label = FilterCatalog.ResolveLabel(i.LabelTag, i.FallbackLabel),
                    kind = i.Kind,
                    fields = i.Fields,
                    numeric = i.Numeric,
                    flag = i.Flag,
                }).ToList(),
            }).ToList();
        }

        /// <summary>
        /// "任意属性 + 数值"下拉的选项：已预计算（因而**真的能过滤**）且语言表里有同名模板的属性。
        ///
        /// ⚠️ 只列已预计算的：<c>StatValueFilters</c> 是直接查 <c>ComputedItemStat</c> 表的，
        /// 没算过的属性放进来会让使用者选一个永远查不到东西的条件。
        /// 后台预计算服务是低速循环，新拾取的物品要过一会儿才出现在这里。
        /// </summary>
        private List<object> Stats() {
            var language = RuntimeSettings.Language;
            var result = new List<object>();

            var names = _computedItemStatDao.ListStatNames()
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Distinct()
                .OrderBy(s => s, StringComparer.Ordinal);

            foreach (var name in names) {
                var template = language?.GetTag(name) ?? string.Empty;
                if (string.IsNullOrWhiteSpace(template)) {
                    continue;
                }

                result.Add(new {
                    name,
                    template,
                    label = FilterCatalog.StripPlaceholders(template),
                });
            }

            return result;
        }

        private static string Label(string tag, string fallback) {
            return FilterCatalog.ResolveLabel(tag, fallback);
        }
    }
}
