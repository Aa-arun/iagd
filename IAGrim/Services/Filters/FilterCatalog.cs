using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using IAGrim.Utilities;

namespace IAGrim.Services.Filters {

    /// <summary>过滤器面板里一个可勾选项的定义。</summary>
    internal sealed class FilterItemDefinition {
        /// <summary>稳定 id，前端用作 React key 与状态键。</summary>
        public required string Id { get; init; }

        /// <summary>标签的 i18n tag（zh.txt 里的 <c>iatag_ui_*</c>）。前端也能用 /api/i18n 自己翻。</summary>
        public required string LabelTag { get; init; }

        /// <summary>语言表查不到时的兜底文本（与旧 WinForms 面板一致）。</summary>
        public required string FallbackLabel { get; init; }

        /// <summary>
        /// <c>stat</c>：勾选 = 物品带这些 stat 之一（→ <c>ItemSearchRequest.Filters</c>），
        /// 还可以再加数值条件（→ <c>ItemSearchRequest.StatValueFilters</c>）。
        /// <c>flag</c>：直接对应 <c>ItemSearchRequest</c> 上的一个布尔字段。
        /// </summary>
        public string Kind { get; init; } = "stat";

        /// <summary>kind=stat 时贡献的 stat 字段名；数值过滤会把这些字段的值**求和**后比较。</summary>
        public string[] Fields { get; init; } = Array.Empty<string>();

        /// <summary>kind=stat 时是否支持"≥ / ≤ 数值"过滤（对应旧面板的 FirefoxCheckBox.SupportsNumericFilter）。</summary>
        public bool Numeric { get; init; }

        /// <summary>kind=flag 时对应的布尔字段名，如 <c>socketedOnly</c>。</summary>
        public string? Flag { get; init; }
    }

    /// <summary>过滤器面板里的一个分区。</summary>
    internal sealed class FilterGroupDefinition {
        public required string Id { get; init; }
        public required string LabelTag { get; init; }
        public required string FallbackLabel { get; init; }
        public required FilterItemDefinition[] Items { get; init; }
    }

    /// <summary>槽位的一个分组（护甲 / 武器 / 首饰 / 物品）。</summary>
    internal sealed class SlotGroupDefinition {
        public required string Id { get; init; }
        public required string Label { get; init; }
        /// <summary>（槽位 key，显示名）。显示名不走 i18n——它由使用者逐项定过。</summary>
        public required (string Value, string Label)[] Slots { get; init; }
    }

    /// <summary>
    /// 过滤器面板的信息架构 —— **照搬**旧 WinForms 面板
    /// （<c>IAGrim/UI/Filters/{Damage,DamageOverTime,Resistances,Misc}.cs</c>）：
    /// 哪个复选框贡献哪些 stat 字段、哪些支持数值过滤，全部原样保留。
    ///
    /// ★ 搬到这里（而不是让前端再抄一份）的理由：这些映射是**行为**，不是样式。
    /// 两份映射迟早会漂移，而"勾了火焰抗性却按别的字段过滤"这种错很难被发现。
    ///
    /// ⚠️ 职业那一组**不在这里**：它的选项来自数据库（<c>tagSkillClassName*</c>），
    /// 见 <see cref="FilterOptionsService"/>。
    /// </summary>
    internal static class FilterCatalog {

        private static FilterItemDefinition Stat(string id, string tag, string fallback, string[] fields, bool numeric = false) {
            return new FilterItemDefinition {
                Id = id, LabelTag = tag, FallbackLabel = fallback,
                Kind = "stat", Fields = fields, Numeric = numeric,
            };
        }

        private static FilterItemDefinition Flag(string id, string tag, string fallback, string flag) {
            return new FilterItemDefinition {
                Id = id, LabelTag = tag, FallbackLabel = fallback, Kind = "flag", Flag = flag,
            };
        }

        /// <summary>抗性组的字段规律：<c>defensive{X}</c> + 修饰 + 减速抗性 + 修饰（旧 Resistances.cs 逐字一致）。</summary>
        private static string[] ResistFields(string type) {
            return [
                $"defensive{type}",
                $"defensive{type}Modifier",
                $"defensiveSlow{type}",
                $"defensiveSlow{type}Modifier",
            ];
        }

        /// <summary>持续伤害组的字段规律（旧 DamageOverTime.cs 逐字一致）。</summary>
        private static string[] DotFields(string type) {
            return [
                $"offensiveSlow{type}",
                $"offensiveSlow{type}Modifier",
                $"offensiveSlow{type}ModifierChance",
                $"offensiveSlow{type}DurationModifier",
                $"retaliationSlow{type}Min",
                $"retaliationSlow{type}Chance",
                $"retaliationSlow{type}Duration",
                $"retaliationSlow{type}DurationMin",
            ];
        }

        public static readonly IReadOnlyList<FilterGroupDefinition> Groups = new FilterGroupDefinition[] {
            new() {
                Id = "damage", LabelTag = "iatag_ui_damage", FallbackLabel = "Damage",
                Items = [
                    Stat("totalDamage", "iatag_ui_totaldmg", "All Damage", ["offensiveTotalDamageModifier"], numeric: true),
                    Flag("dmgRetaliation", "iatag_ui_retaliation", "Retaliation", "isRetaliation"),
                    // 火/冰/电三种元素伤害**同时**算作元素伤害（旧 Damage.cs 的 isElemental 分支）。
                    Stat("dmgElemental", "iatag_ui_elemental", "Elemental", ["offensiveElemental", "offensiveElementalModifier"], numeric: true),
                    Stat("dmgPhysical", "iatag_ui_physical", "Physical", ["offensivePhysical", "offensivePhysicalModifier"], numeric: true),
                    Stat("dmgPiercing", "iatag_ui_piercing", "Piercing", ["offensivePierce", "offensivePierceModifier"], numeric: true),
                    Stat("dmgFire", "iatag_ui_fire", "Fire", ["offensiveFire", "offensiveFireModifier", "offensiveElemental", "offensiveElementalModifier"], numeric: true),
                    Stat("dmgCold", "iatag_ui_cold", "Cold", ["offensiveCold", "offensiveColdModifier", "offensiveElemental", "offensiveElementalModifier"], numeric: true),
                    Stat("dmgLightning", "iatag_ui_lightning", "Lightning", ["offensiveLightning", "offensiveLightningModifier", "offensiveElemental", "offensiveElementalModifier"], numeric: true),
                    Stat("dmgAether", "iatag_ui_aether", "Aether", ["offensiveAether", "offensiveAetherModifier"], numeric: true),
                    Stat("dmgVitality", "iatag_ui_vitality", "Vitality", ["offensiveLife", "offensiveLifeModifier"], numeric: true),
                    Stat("dmgChaos", "iatag_ui_chaos", "Chaos", ["offensiveChaos", "offensiveChaosModifier"], numeric: true),
                    Stat("dmgAcid", "iatag_ui_acid", "Acid", ["offensivePoison", "offensivePoisonModifier"], numeric: true),
                ],
            },
            new() {
                Id = "dot", LabelTag = "iatag_ui_dot", FallbackLabel = "Damage over time",
                Items = [
                    Stat("dmgBleeding", "iatag_ui_bleeding", "Bleeding", DotFields("Bleeding"), numeric: true),
                    Stat("dmgTrauma", "iatag_ui_trauma", "Trauma", DotFields("Physical"), numeric: true),
                    Stat("dmgBurn", "iatag_ui_burn", "Burn", DotFields("Fire"), numeric: true),
                    Stat("dmgElectrocute", "iatag_ui_electrocute", "Electrocute", DotFields("Lightning"), numeric: true),
                    Stat("dmgVitalityDecay", "iatag_ui_decay", "Decay", DotFields("Life"), numeric: true),
                    Stat("dmgFrost", "iatag_ui_frost", "Frost/freeze", DotFields("Cold"), numeric: true),
                    Stat("dmgPoison", "iatag_ui_poison", "Poison", DotFields("Poison"), numeric: true),
                    Stat("dmgLifeLeech", "iatag_ui_lifeleech", "Life Leech", ["offensiveLifeLeechMin", "offensiveSlowLifeLeachMin"], numeric: true),
                ],
            },
            new() {
                Id = "resistances", LabelTag = "iatag_ui_resistances", FallbackLabel = "Resistances",
                Items = [
                    Stat("resistElemental", "iatag_ui_resistance_elemental", "Elemental", ["defensiveElementalResistance"], numeric: true),
                    Stat("resistPhysical", "iatag_ui_resistance_physical", "Physical", ResistFields("Physical"), numeric: true),
                    Stat("resistPiercing", "iatag_ui_resistance_piercing", "Piercing", ResistFields("Pierce"), numeric: true),
                    Stat("resistFire", "iatag_ui_resistance_fire", "Fire", ResistFields("Fire"), numeric: true),
                    Stat("resistCold", "iatag_ui_resistance_cold", "Cold", ResistFields("Cold"), numeric: true),
                    Stat("resistLightning", "iatag_ui_resistance_lightning", "Lightning", ResistFields("Lightning"), numeric: true),
                    Stat("resistAether", "iatag_ui_resistance_aether", "Aether", ResistFields("Aether"), numeric: true),
                    Stat("resistVitality", "iatag_ui_resistance_vitality", "Vitality", ResistFields("Life"), numeric: true),
                    Stat("resistChaos", "iatag_ui_resistance_chaos", "Chaos", ResistFields("Chaos"), numeric: true),
                    Stat("resistPoison", "iatag_ui_resistance_poison", "Poison", ResistFields("Poison"), numeric: true),
                    Stat("resistBleeding", "iatag_ui_resistance_bleeding", "Bleeding", ResistFields("Bleeding"), numeric: true),
                    Stat("resistStun", "iatag_ui_resistance_stun", "Stun", ResistFields("Stun"), numeric: true),
                    Stat("resistSlow", "iatag_ui_resistance_slow", "Slow", ["defensiveTotalSpeedResistance"], numeric: true),
                ],
            },
            new() {
                Id = "misc", LabelTag = "iatag_ui_misc", FallbackLabel = "Misc",
                Items = [
                    Stat("health", "iatag_ui_health", "Health", ["characterLifeModifier", "characterLife"], numeric: true),
                    Stat("cbOffensive", "iatag_ui_offensive", "Offensive", ["characterOffensiveAbility", "characterOffensiveAbilityModifier"], numeric: true),
                    Stat("cbDefense", "iatag_ui_defensive", "Defensive", ["characterDefensiveAbilityModifier", "characterDefensiveAbility"], numeric: true),
                    Stat("cbCunning", "iatag_ui_cunning", "Adds Cunning", ["characterDexterity", "characterDexterityModifier"]),
                    Stat("cbSpirit", "iatag_ui_spirit", "Adds Spirit", ["characterIntelligence", "characterIntelligenceModifier"]),
                    Stat("cbPhysique", "iatag_ui_physique", "Adds Physique", ["characterStrength", "characterStrengthModifier"]),
                    Stat("cbIncreaseArmor", "iatag_ui_armorincrease", "Armor increase", ["defensiveProtectionModifier"]),
                    Stat("cbAttackSpeed", "iatag_ui_attackspeed", "Attack Speed", ["characterAttackSpeedModifier", "characterAttackSpeed", "characterTotalSpeedModifier"]),
                    Stat("cbCastspeed", "iatag_ui_castspeed", "Cast Speed", ["characterSpellCastSpeedModifier", "characterTotalSpeedModifier"]),
                    Stat("cbRunspeed", "iatag_ui_runspeed", "Movement Speed", ["characterRunSpeedModifier", "characterTotalSpeedModifier"]),
                    Stat("cbCooldownReduction", "iatag_ui_cooldown_reduction", "Cooldown Reduction", ["skillCooldownReduction"]),
                    Stat("cbDamageConversion", "iatag_ui_weapon_damage_conversion", "Damage Conversion", ["conversionPercentage"]),
                    Stat("cbWeaponLifeLeech", "iatag_ui_weapon_life_leech", "Weapon Life Leech", ["offensiveLifeLeechMin"]),
                    Stat("cbEnergyRegen", "iatag_ui_energy_regen", "Energy Regeneration", ["characterManaRegen", "characterManaRegenModifier"]),
                    Stat("cbMasterySkills", "iatag_ui_mastery", "Mastery Skills", ["augmentMastery1", "augmentMastery2"]),
                    Stat("exp", "iatag_ui_experience", "Experience", ["characterIncreasedExperience"]),
                    Stat("cbReflect", "iatag_ui_reflect", "Reflect", ["defensiveReflect"]),
                    Stat("shieldStuff", "iatag_ui_block", "Block", ["blockAbsorption", "defensiveBlock", "defensiveBlockChance", "defensiveBlockModifier", "defensiveBlockAmountModifier"]),
                    Stat("setbonus", "iatag_ui_setbonus", "Set Bonus", ["setName", "itemSetName"]),
                    Flag("cbHasPetBonus", "iatag_ui_haspetbonus", "战宠", "hasPetBonus"),
                    Flag("cbSocketed", "iatag_ui_socketedonly", "已镶嵌", "socketedOnly"),
                    Flag("cbEnchanted", "iatag_ui_enchanted", "已附魔", "enchantedOnly"),
                    Flag("cbDuplicates", "iatag_ui_duplicatesonly", "多件同款", "duplicatesOnly"),
                    Flag("cbGrantsSkill", "iatag_ui_grants_skill", "Grants Skill", "withGrantSkillsOnly"),
                    Flag("cbSummonerSkill", "iatag_ui_grants_summon_skill", "Grants Summon Skill", "withSummonerSkillOnly"),
                ],
            },
        };

        /// <summary>
        /// 槽位，按部位分成四组。**顺序与命名由使用者 2026-09-13 逐项确定**——
        /// 不是照搬游戏数据的顺序，也不是 i18n 表的措辞。
        ///
        /// ⚠️ 游戏数据里还有"镶嵌物"（`ItemRelic`）与"通缉令"（`ItemFactionWarrant`）两个槽位，
        /// 但数据库里各 0 件（IA 不收录），所以不列。
        /// </summary>
        public static readonly IReadOnlyList<SlotGroupDefinition> SlotGroups = new SlotGroupDefinition[] {
            new() {
                Id = "armor", Label = "护甲",
                Slots = [
                    ("ArmorProtective_Head", "头盔"),
                    ("ArmorProtective_Shoulders", "护肩"),
                    ("ArmorProtective_Chest", "胸甲"),
                    ("ArmorProtective_Hands", "护手"),
                    ("ArmorProtective_Waist", "腰带"),
                    ("ArmorProtective_Legs", "护腿"),
                    ("ArmorProtective_Feet", "靴子"),
                ],
            },
            new() {
                Id = "weapon", Label = "武器",
                Slots = [
                    ("WeaponMelee_Sword", "单手剑"),
                    ("WeaponMelee_Axe", "单手斧"),
                    ("WeaponMelee_Mace", "单手锤"),
                    ("WeaponMelee_Dagger", "匕首"),
                    ("WeaponMelee_Scepter", "权杖"),
                    ("WeaponHunting_Ranged1h", "单手远程"),
                    ("WeaponArmor_Shield", "盾牌"),
                    ("WeaponArmor_Offhand", "副手"),
                    ("WeaponMelee_Sword2h", "双手剑"),
                    ("WeaponMelee_Axe2h", "双手斧"),
                    ("WeaponMelee_Mace2h", "双手锤"),
                    ("WeaponMelee_Spear2h", "双手矛"),
                    ("WeaponHunting_Ranged2h", "双手远程"),
                ],
            },
            new() {
                Id = "jewelry", Label = "首饰",
                Slots = [
                    ("ArmorJewelry_Ring", "戒指"),
                    ("ArmorJewelry_Amulet", "项链"),
                    ("ArmorJewelry_Medal", "勋章"),
                ],
            },
            new() {
                Id = "item", Label = "物品",
                Slots = [
                    ("ItemArtifact", "圣物"),
                    ("ItemEnchantment", "附魔"),
                    ("ItemFactionBooster", "卷轴"),
                ],
            },
        };

        /// <summary>
        /// "所有物品"用的哨兵值：它不是某个槽位，而是**排除全部装备槽位**（`slotInverse`）。
        /// 使用者要它兜住分类的遗漏——万一还有没列到的物品类型，这一项能全捞出来。
        /// ⚠️ 它与其它槽位互斥：选中它就等于放弃逐项选择。
        /// </summary>
        public const string AllItemsSlotValue = "__all_items__";

        /// <summary>
        /// 十个基础职业，顺序由使用者 2026-09-13 确定。
        ///
        /// 只列基础职业：游戏数据里还有"士兵+爆破"这类**组合**职业（`class0102`），
        /// 但装备上的职业加成只针对单个职业，组合对筛选没有意义。
        /// 名称也不取自游戏数据——那里 class07/08/09 是 `?`（缺翻译）。
        /// </summary>
        public static readonly IReadOnlyList<(string Value, string Label)> BaseClasses = [
            ("class01", "士兵"),
            ("class02", "爆破"),
            ("class03", "神秘学者"),
            ("class04", "夜刃"),
            ("class05", "奥术"),
            ("class06", "萨满"),
            ("class07", "审判"),
            ("class08", "死灵法师"),
            ("class09", "守誓"),
            ("class10", "狂战士"),
        ];

        /// <summary>取 i18n tag 对应的中文；语言表还没准备好或没有该 tag 时回退到英文。</summary>
        public static string ResolveLabel(string tag, string fallback) {
            var translated = RuntimeSettings.Language?.GetTag(tag);
            return string.IsNullOrWhiteSpace(translated) ? fallback : translated;
        }

        // ── 关键词 → 属性名（"搜火焰抗性要找出带该属性的物品"）────────────────────

        /// <summary>去掉模板里的 <c>{0}</c> / <c>{1}</c> 等占位符，得到可读的属性名。</summary>
        private static readonly Regex Placeholder = new(@"\{\d+(?::[^}]*)?\}", RegexOptions.Compiled);

        /// <summary>
        /// 模板 → 可读文本：<c>"{0}% 火焰抗性"</c> → <c>"X% 火焰抗性"</c>。
        ///
        /// 占位符替换成 <c>X</c> 而不是删掉：删掉之后 <c>+{0}% 攻击速度</c> 会变成
        /// <c>"+ % 攻击速度"</c>，在属性下拉里很难认；<c>X</c> 保留了"这里是个数值"的形状。
        /// 模板本身也会一并返回给前端，需要精确渲染时用得上。
        /// </summary>
        public static string StripPlaceholders(string? template) {
            if (string.IsNullOrWhiteSpace(template)) {
                return string.Empty;
            }

            var text = Placeholder.Replace(template, "X").Trim();
            while (text.Contains("  ")) {
                text = text.Replace("  ", " ");
            }

            return text;
        }

        /// <summary>一条"可被关键词命中"的索引项：一段可搜索文本 + 它代表的 stat 名。</summary>
        private sealed record SearchEntry(string Text, string[] Stats);

        private static IReadOnlyList<SearchEntry>? _index;
        private static readonly object IndexLock = new();

        /// <summary>
        /// 关键词索引。两个来源：
        ///   ① 固定组的人工标签（组名 + 项名，中英双语，再拼出"抗性火焰 / 火焰抗性"两种顺序）
        ///   ② 语言表里**同名属性模板**的文本（<c>defensiveFire</c> → "{0}% 火焰抗性"）
        ///
        /// ★ 第 ② 类必须排除 <c>customtag_*</c> / <c>iatag_*</c> / <c>tag*</c>：
        /// 它们是"组合模板"（如 <c>{1} {3} 伤害</c>），key 不是数据库里的 stat 名，
        /// 而且去掉占位符只剩"伤害"两个字，会把所有搜"伤害"的人都引到不存在的字段上。
        /// </summary>
        private static IReadOnlyList<SearchEntry> Index {
            get {
                if (_index != null) {
                    return _index;
                }

                lock (IndexLock) {
                    if (_index != null) {
                        return _index;
                    }

                    var entries = new List<SearchEntry>();

                    foreach (var group in Groups) {
                        var groupZh = ResolveLabel(group.LabelTag, group.FallbackLabel);
                        var groupEn = group.FallbackLabel;

                        foreach (var item in group.Items.Where(i => i.Kind == "stat" && i.Fields.Length > 0)) {
                            var itemZh = ResolveLabel(item.LabelTag, item.FallbackLabel);
                            var itemEn = item.FallbackLabel;

                            // 两种顺序都拼一份："抗性 火焰" 与 "火焰 抗性"——
                            // 使用者可能搜"火焰抗性"（连写），也可能搜"火焰 抗性"（分词）。
                            var text = string.Join(" ", new[] {
                                groupZh, itemZh, itemZh + groupZh, groupZh + itemZh,
                                groupEn, itemEn, itemEn + " " + groupEn, groupEn + " " + itemEn,
                            });

                            entries.Add(new SearchEntry(text, item.Fields));
                        }
                    }

                    var tags = RuntimeSettings.Language?.ExportTags();
                    if (tags != null) {
                        foreach (var pair in tags) {
                            var key = pair.Key;
                            if (string.IsNullOrEmpty(key) || string.IsNullOrWhiteSpace(pair.Value)) {
                                continue;
                            }

                            if (key.StartsWith("customtag_", StringComparison.OrdinalIgnoreCase)
                                || key.StartsWith("iatag_", StringComparison.OrdinalIgnoreCase)
                                || key.StartsWith("tag", StringComparison.OrdinalIgnoreCase)) {
                                continue;
                            }

                            var text = StripPlaceholders(pair.Value);
                            if (text.Length < 2) {
                                continue;
                            }

                            entries.Add(new SearchEntry(text, [key]));
                        }
                    }

                    _index = entries;
                    return _index;
                }
            }
        }

        /// <summary>
        /// 把搜索框里的关键词解析成一组 stat 名。
        ///
        /// 规则：关键词按空格分词，**每个词都要命中同一段可搜索文本**（AND），
        /// 命中的条目贡献的全部 stat 名取并集。搜"火焰抗性"因此能同时命中
        /// 抗性组的"火焰"项与模板 <c>defensiveFire</c>。
        ///
        /// 返回空表示"这句话与属性无关"，调用方应当只按名字搜索。
        /// </summary>
        public static IReadOnlyList<string> ResolveKeyword(string? wildcard) {
            if (string.IsNullOrWhiteSpace(wildcard)) {
                return Array.Empty<string>();
            }

            var terms = wildcard
                .ToLowerInvariant()
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            if (terms.Length == 0) {
                return Array.Empty<string>();
            }

            var stats = new List<string>();
            var seen = new HashSet<string>(StringComparer.Ordinal);

            foreach (var entry in Index) {
                var haystack = entry.Text.ToLowerInvariant();
                if (!terms.All(t => haystack.Contains(t, StringComparison.Ordinal))) {
                    continue;
                }

                foreach (var stat in entry.Stats) {
                    if (seen.Add(stat)) {
                        stats.Add(stat);
                    }
                }
            }

            return stats;
        }
    }
}
