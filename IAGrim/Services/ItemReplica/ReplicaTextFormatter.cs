using System.Text.RegularExpressions;

namespace IAGrim.Services.ItemReplica {
    /// <summary>
    /// Formats the raw tooltip rows the game dumps for an item replica.
    ///
    /// A row carries ^-prefixed color codes marking its segments (^E label, ^H value, ^S/^W weapon
    /// header, ^Z skill name), which the UI turns into per-segment coloring, and may end in a
    /// [min-max] range added by the Asterkarn DLC.
    /// </summary>
    static class ReplicaTextFormatter {
        // A trailing " [min-max]" / " (min-max)", including the color code in front of it.
        private static readonly Regex RangeSuffix = new Regex(@"\s(\^.)?(\[|\().+(\]|\))$", RegexOptions.Compiled);
        private static readonly Regex ColorCodes = new Regex(@"\^.?", RegexOptions.Compiled);

        /// <summary>
        /// `^s(...)` —— 英文技能名（`^c震荡大地 ^s(Brute Force)`）。
        ///
        /// ★ 界面上**不显示**它（前端 CSS `.tt-s { display: none }`），所以搜索文本里
        /// 也不该留：否则会"搜出看不见的东西"——使用者 2026-09-14 搜 "LS" 命中
        /// `chi**ls**urge`（Chillsurge）就是这么来的。
        ///
        /// ⚠️ 必须**先删它、再删颜色码**：`\^.?` 会把 `^s` 一起吃掉、只剩 `(...)`。
        /// </summary>
        private static readonly Regex HiddenEnglishName = new Regex(@"\^s\([^)]*\)", RegexOptions.Compiled);

        /// <summary>
        /// **没有颜色码**的行里，括号中的英文技能名：`&lt;审判&gt;寒潮 (Chillsurge) 技能等级 +2`。
        ///
        /// ★ 游戏只在**带颜色码**的行里给英文名打 `^s` 标记；裸文本那批（同一件装备在不同
        /// 角色上导出的形态不同）就只剩一对括号。实测库里两种都有，所以两种都得处理。
        ///
        /// ⚠️ 前端 `stripEnglishSkillName()` 有**双重保护**，这里照抄：
        ///   ① 只处理**没有 `^`** 的行（有码的英文名已被 `^s` 覆盖）；
        ///   ② 只处理含"技能等级"的行。
        ///   否则会把 `(OA)` / `(CDR)` / `(LS)` / `(Crit)` 这些**缩写**一起删掉——
        ///   而"攻击伤害转化为生命值(LS)"恰恰是使用者想搜到的东西。
        /// </summary>
        private static readonly Regex PlainEnglishSkillName = new Regex(@" \(([A-Za-z][A-Za-z'’\- ]{3,})\)", RegexOptions.Compiled);

        /// <summary>
        /// Row text as shown to the user: color codes intact, trailing damage range removed.
        /// </summary>
        public static string Display(string? text) {
            return RangeSuffix.Replace((text ?? string.Empty).Trim(), string.Empty);
        }

        /// <summary>
        /// Row text as indexed for wildcard search: hidden English names dropped,
        /// color codes removed, lowercased.
        /// </summary>
        public static string Searchable(string? text) {
            var visible = HiddenEnglishName.Replace(Display(text), string.Empty);

            // 无码行里的英文技能名没有 `^s` 标记，形状与前端 stripEnglishSkillName 一致
            if (!visible.Contains('^') && visible.Contains("技能等级")) {
                visible = PlainEnglishSkillName.Replace(visible, string.Empty);
            }

            return ColorCodes.Replace(visible, string.Empty).ToLowerInvariant();
        }
    }
}
