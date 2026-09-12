namespace IAGrim.Database.Dto {

    /// <summary>
    /// 一条品质条件：品质值 + 可选的最少词缀数。
    ///
    /// ★ 为什么需要"品质 + 词缀数"的组合：界面上有一个**双稀有**选项——
    /// 绿色物品里带两个词缀的那些（如"萨拉查的王者之剑"）。
    /// 单靠品质值表达不了它；而 <see cref="ItemSearchRequest.PrefixRarity"/> 是单值，
    /// 与品质多选不兼容。
    ///
    /// ⚠️ 多条之间是**或**（满足任意一条即可），在 <c>PlayerItemDaoImpl</c> 里展开成括号 OR。
    /// </summary>
    public class RarityCondition {
        /// <summary>数据库里的品质值：<c>Yellow</c> / <c>Green</c> / <c>Blue</c> / <c>Epic</c>。</summary>
        public string Rarity { get; set; } = string.Empty;

        /// <summary>最少词缀数；0 = 不限（只看品质）。</summary>
        public int PrefixRarity { get; set; }
    }
}
