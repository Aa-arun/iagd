using System.Collections.Generic;
using System.Linq;

namespace StatTranslator
{
    public static class SlotTranslator {
        /// <summary>
        /// 槽位 key → 中文标签的 i18n tag。
        ///
        /// ★ 这是**固定清单**，不是"数据库里出现过的 Class 值"：`DatabaseItemStat_v2` 里
        /// <c>stat = 'Class'</c> 还包含游戏引擎的其它物品类别（容器、可破坏物、怪物、
        /// 药水、任务物品…… 实测 175 项），那些不是装备槽位，列给使用者没有意义。
        /// 旧界面（<c>UIHelper.SlotFilter</c>）用的也是这份清单。
        ///
        /// ⚠️ 顺序即面板里的展示顺序（按部位排列），不要随口重排。
        /// </summary>
        private static readonly Dictionary<string, string> SlotTags = new Dictionary<string, string>
        {
            ["ArmorProtective_Head"] = "iatag_slot_head",
            ["ArmorProtective_Hands"] = "iatag_slot_hands",
            ["ArmorProtective_Feet"] = "iatag_slot_feet",
            ["ArmorProtective_Legs"] = "iatag_slot_legs",
            ["ArmorProtective_Chest"] = "iatag_slot_chest",
            ["ArmorProtective_Waist"] = "iatag_slot_belt",
            ["ArmorJewelry_Medal"] = "iatag_slot_medal",
            ["ArmorJewelry_Ring"] = "iatag_slot_ring",
            ["ArmorProtective_Shoulders"] = "iatag_slot_shoulder",
            ["ArmorJewelry_Amulet"] = "iatag_slot_neck",
            ["WeaponMelee_Dagger"] = "iatag_slot_dagger1h",
            ["WeaponMelee_Mace"] = "iatag_slot_mace1h",
            ["WeaponMelee_Axe"] = "iatag_slot_axe1h",
            ["WeaponMelee_Scepter"] = "iatag_slot_scepter1h",
            ["WeaponMelee_Sword"] = "iatag_slot_sword1h",
            ["WeaponMelee_Sword2h"] = "iatag_slot_sword2h",
            ["WeaponMelee_Mace2h"] = "iatag_slot_mace2h",
            ["WeaponMelee_Axe2h"] = "iatag_slot_axe2h",
            ["WeaponMelee_Spear2h"] = "iatag_slot_spear2h",
            ["WeaponHunting_Ranged1h"] = "iatag_slot_ranged1h",
            ["WeaponHunting_Ranged2h"] = "iatag_slot_ranged2h",
            ["WeaponArmor_Offhand"] = "iatag_slot_offhand",
            ["WeaponArmor_Shield"] = "iatag_slot_shield",
            ["ItemRelic"] = "iatag_slot_component",
            ["ItemArtifact"] = "iatag_slot_relic",
            ["ItemFactionBooster"] = "iatag_slot_scroll",
            ["ItemFactionWarrant"] = "iatag_slot_warrant",
            ["ItemEnchantment"] = "iatag_slot_augmentation"
        };

        static Dictionary<string, string>? SlotMap;

        /// <summary>全部槽位 key，顺序与 <see cref="Translate"/> 的清单一致。</summary>
        public static IEnumerable<string> Keys => SlotTags.Keys;

        /// <summary>槽位 key 对应的 i18n tag；清单外的 key 原样返回。</summary>
        public static string TagFor(string key) {
            return !string.IsNullOrEmpty(key) && SlotTags.TryGetValue(key, out var tag) ? tag : key;
        }

        public static string Translate(ILocalizedLanguage language, string stat) {
            if (SlotMap == null) {
                SlotMap = SlotTags.ToDictionary(kv => kv.Key, kv => language.GetTag(kv.Value));
            }

            if (!string.IsNullOrEmpty(stat) && SlotMap.ContainsKey(stat))
            {
                return SlotMap[stat];
            }

            return stat;
        }
    }
}
