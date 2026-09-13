using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using IAGrim.Services.ItemStats;

namespace IAGrim.Database.Dto {

    public class ItemSearchRequest {
        public string? Wildcard { get; set; }

        /// <summary>
        /// 由搜索框关键词解析出来的属性名（stat 名）：命中的物品**即使名字里没有关键词**也会返回。
        ///
        /// ⚠️ 这是**后端内部字段**，由 HTTP 层在调用 DAO 之前填充
        /// （见 <c>FilterOptionsService.ResolveKeyword</c>），前端不需要也不应该自己设置它。
        /// </summary>
        public List<string> WildcardStats { get; set; } = new List<string>();

        public List<string[]> Filters { get; set; } = new List<string[]>();

        /// <summary>
        /// Per-checkbox numeric stat filters (e.g. Fire damage &gt;= 30) attached via each stat checkbox's
        /// filter button. Each is applied as an in-database subquery against the pre-computed stat table.
        /// Empty/null for searches with no numeric stat filters.
        /// </summary>
        public List<StatValueFilter> StatValueFilters { get; set; } = new List<StatValueFilter>();

        public float MinimumLevel { get; set; }
        public float MaximumLevel { get; set; }
        public string? Rarity { get; set; }

        /// <summary>
        /// 品质**多选**（`Yellow` / `Green` / `Blue` / `Epic`），对应过滤器面板里的稀有度 checklist
        /// （见 .docs/09-高级搜索.md §3）。
        ///
        /// ★ 非空时**优先于** <see cref="Rarity"/>（后者是单值简写形式）。
        ///
        /// 表达不了"双稀有"这类"品质 + 词缀数"的组合——那种用 <see cref="RarityConditions"/>。
        ///
        /// ⚠️ 值是**数据库里的值**，不是游戏里的说法：游戏的"传奇"在库里是 `Epic`、
        /// 游戏的"史诗"是 `Blue`。可选项与中文标签见 `GET /api/filters/options` 的 `qualities`。
        /// </summary>
        public List<string> Rarities { get; set; } = new List<string>();

        /// <summary>
        /// 按**等级需求**升序排列；false = 按物品名排序。
        ///
        /// 它只是排序、不是过滤条件，所以不影响 <see cref="IsEmpty"/>。
        /// ⚠️ 分页期间换排序会让切片对不上——那是调用方要自己避免的事。
        /// </summary>
        public bool OrderByLevel { get; set; }

        /// <summary>
        /// 排序方式（使用者 2026-09-13 要求，从高级搜索搬到工具条）。
        ///
        /// 取值（大小写不敏感）：
        /// <list type="bullet">
        ///   <item><c>created</c> —— 按入库时间**从新到旧**（前端默认）</item>
        ///   <item><c>quality</c> —— 品质 &gt; 等级 &gt; 名称</item>
        ///   <item><c>level</c>   —— 等级 &gt; 品质 &gt; 名称</item>
        ///   <item><c>name</c>    —— 名称 &gt; 品质 &gt; 等级</item>
        /// </list>
        ///
        /// 空 / 不认识的值 = 沿用旧行为（见 <see cref="OrderByLevel"/>），
        /// 这样既有的调用方（旧界面路径、只是浏览的 <c>GET /api/items</c>）不受影响。
        ///
        /// ⚠️ 与 <see cref="OrderByLevel"/> 一样：**只是排序，不是过滤条件**，
        /// 不参与 <see cref="IsEmpty"/>；分页期间改它会让切片对不上，是调用方要避免的事。
        /// </summary>
        public string? SortBy { get; set; }

        /// <summary>
        /// 品质条件，**组内是或**（满足任意一条即可）。用于"双稀有"这种需要带上词缀数的组合。
        /// 非空时优先于 <see cref="Rarities"/> 与 <see cref="Rarity"/>。
        /// </summary>
        public List<RarityCondition> RarityConditions { get; set; } = new List<RarityCondition>();

        public string[]? Slot { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether the search should exclude items with types specified in the <see cref="Slot"/> array.
        /// If <see langword="true"/>, items with types in <see cref="Slot"/> will be excluded.
        /// If <see langword="false"/>, items with types in <see cref="Slot"/> will be included.
        /// </summary>
        public bool SlotInverse { get; set; }

        /// <summary>
        /// Pet-bonus scope: restrict all other stat filters to the item's pet records instead of its
        /// player-facing records (e.g. "attack speed on the pet"). See PlayerItemDaoImpl.
        /// </summary>
        public bool PetBonuses { get; set; }

        /// <summary>
        /// Plain "has a pet bonus" filter (the legacy behaviour): match items that grant any pet bonus,
        /// without scoping the other stat filters to the pet. Combines with normal filters so a player
        /// can search e.g. "has a pet bonus AND cold damage (on the player)".
        /// </summary>
        public bool HasPetBonus { get; set; }
        public bool IsRetaliation { get; set; }
        public bool DuplicatesOnly { get; set; }
        public string? Mod { get; set; }
        public bool IsHardcore { get; set; }
        public bool RecipeItemsOnly { get; set; }
        public int PrefixRarity { get; set; }

        public List<string> Classes { get; set; } = new List<string>();

        /// <summary>
        /// 职业过滤用**或**还是**与**：false（默认）= 与（装备要同时加成这些职业），
        /// true = 或（加成其中任意一个即可）。
        ///
        /// ★ 后端天然是"与"（每个职业各一条子查询）；"或"要合并成一条 `IN`。
        /// 界面上这个开关挂在「职业」这个**组名**上，点一下切换——与物品属性组同一套交互。
        /// </summary>
        public bool ClassesAny { get; set; }

        public bool SocketedOnly { get; set; }

        /// <summary>只看装过附魔的装备（<c>PlayerItem.EnchantmentRecord</c> 非空）。</summary>
        public bool EnchantedOnly { get; set; }

        /// <summary>
        /// 只看最近 <b>N 小时</b>内入库的物品；0 = 不限。
        ///
        /// ★ 用小时数而不是布尔：界面上给的是"五小时内 / 一天内 / 一周内 / 一月内"的单选，
        /// 布尔只能表达"最近"一个档。
        /// </summary>
        public int RecentHours { get; set; }

        /// <summary>
        /// Items which grants a skill that can be placed on the hotbar and triggered.
        /// </summary>
        public bool WithGrantSkillsOnly { get; set; }

        public bool WithSummonerSkillOnly { get; set; }

        public bool IsEmpty {
            get {
                if (!String.IsNullOrEmpty(Wildcard))
                    return false;
                if (Filters.Count > 0)
                    return false;
                if (MinimumLevel >= 1 || MaximumLevel <= 84)
                    return false;
                if (!String.IsNullOrEmpty(Rarity) || Rarities.Count > 0 || RarityConditions.Count > 0 || Slot != null)
                    return false;
                if (PetBonuses || HasPetBonus || IsRetaliation || Classes.Count > 0
                    || SocketedOnly || EnchantedOnly || RecentHours > 0)
                    return false;
                if (WithGrantSkillsOnly || WithSummonerSkillOnly || DuplicatesOnly || PrefixRarity > 0)
                    return false;
                if (StatValueFilters?.Count > 0)
                    return false;
                return true;
            }
        }
    }
}
