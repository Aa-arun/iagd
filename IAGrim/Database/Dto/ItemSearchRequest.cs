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
        /// 旧界面走的 <c>SearchController.Search()</c> 不填它，所以旧界面的搜索行为完全不变。
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
        /// ★ 非空时**优先于** <see cref="Rarity"/>；单值那个字段是旧界面路径用的，
        /// 留着它旧界面的搜索行为就完全不变。
        ///
        /// ⚠️ 值是**数据库里的值**，不是游戏里的说法：游戏的"传奇"在库里是 `Epic`、
        /// 游戏的"史诗"是 `Blue`。可选项与中文标签见 `GET /api/filters/options` 的 `qualities`。
        /// </summary>
        public List<string> Rarities { get; set; } = new List<string>();

        /// <summary>
        /// 按**等级需求**升序排列（与旧界面的「按等级排序」复选框一致）；false = 按物品名排序。
        ///
        /// 它只是排序、不是过滤条件，所以不影响 <see cref="IsEmpty"/>。
        /// ⚠️ 分页期间换排序会让切片对不上——那是调用方要自己避免的事。
        /// </summary>
        public bool OrderByLevel { get; set; }

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

        public bool SocketedOnly { get; set; }

        public bool RecentOnly { get; set; }

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
                if (!String.IsNullOrEmpty(Rarity) || Rarities.Count > 0 || Slot != null)
                    return false;
                if (PetBonuses || HasPetBonus || IsRetaliation || Classes.Count > 0 || SocketedOnly || RecentOnly)
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
