using IAGrim.Database;
using IAGrim.Database.Interfaces;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using EvilsoftCommons.Exceptions;
using IAGrim.Database.DAO.Util;
using IAGrim.Database.Model;
using IAGrim.Services.ItemReplica;
using IAGrim.UI.Controller.dto;
using log4net;
using Newtonsoft.Json;
using StatTranslator;

namespace IAGrim.Utilities {
    internal static class ItemHtmlWriter {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(ItemHtmlWriter));

        private static JsonStat ToJsonStat(TranslatedStat stat) {
            return new JsonStat {
                Text = stat.Text,
                Param0 = stat.Param0,
                Param1 = stat.Param1,
                Param2 = stat.Param2,
                Param3 = stat.Param3,
                Param4 = stat.Param4,
                Param5 = stat.Param5,
                Param6 = stat.Param6,
                Extras = stat.Extra?.ToString()
            };
        }

        private static JsonSkill GetJsonSkill(PlayerItemSkill skill) {
            return new JsonSkill {
                Name = skill.Name,
                Description = skill.Description,
                Level = skill.Level,
                Trigger = skill.Trigger?.ToString(),
                PetStats = skill.PetStats.Select(ToJsonStat).ToList(),
                BodyStats = skill.BodyStats.Select(ToJsonStat).ToList(),
                HeaderStats = skill.HeaderStats.Select(ToJsonStat).ToList(),
            };
        }


        private static string GetUniqueIdentifier(PlayerHeldItem item) {
            switch (item) {
                case PlayerItem pi:
                    return $"PI/{pi.Id}/{pi.CloudId}";
                case BuddyItem bi:
                    // TODO: Remove this, buddy items are never transferable. Gotta provide a better unique id.
                    return $"BI/{bi.BuddyId}/{bi.RemoteItemId}";
                default:
                    return $"UK/{item.BaseRecord}";
            }
        }

        private static JsonItem GetJsonItem(PlayerHeldItem item) {
            // TODO: Modifiers

            bool isHardcore = false;
            bool isCloudSynced = false;
            object[] transferUrl = { "", "", "", "" };
            string uniqueIdentifier = GetUniqueIdentifier(item);
            List<ItemStatInfo>? replicaStats = null;
            var mergeIdentifier = item.BaseRecord ?? string.Empty;
            if (item is PlayerItem pi) {
                transferUrl = new object[] { pi.BaseRecord ?? "", pi.PrefixRecord ?? "", pi.SuffixRecord ?? "", pi.MateriaRecord ?? "", pi.Mod ?? "", pi.IsHardcore };
                isCloudSynced = pi.IsCloudSynchronized;
                isHardcore = pi.IsHardcore;

                if (!string.IsNullOrEmpty(pi.ReplicaInfo)) {
                    replicaStats = JsonConvert.DeserializeObject<List<ItemStatInfo>>(pi.ReplicaInfo);
                }


                mergeIdentifier += (pi.PrefixRecord ?? string.Empty) + (pi.SuffixRecord ?? string.Empty);
            }
            else if (item is BuddyItem bi) {
                mergeIdentifier += (bi.PrefixRecord ?? string.Empty) + (bi.SuffixRecord ?? string.Empty);
                if (!string.IsNullOrEmpty(bi.ReplicaInfo)) {
                    replicaStats = JsonConvert.DeserializeObject<List<ItemStatInfo>>(bi.ReplicaInfo);
                }
            }

            if (replicaStats != null && replicaStats.Count == 0) {
                replicaStats = null; // Too many things check for null instead of empty, so just set it to null.
            }

            ItemTypeDto type;
            string extras = item.Stash ?? string.Empty;

            if (item.IsRecipe) {
                type = ItemTypeDto.Recipe;
            }
            else if (!string.IsNullOrEmpty(item.Stash)) {
                type = ItemTypeDto.Buddy;
            }
            else if (item is PlayerItem) {
                type = ItemTypeDto.Player;
            }
            else {
                type = ItemTypeDto.Unknown;
            }

            bool skipStats = replicaStats != null;
            var replicaBodyStats = new List<JsonStat>(0);
            if (skipStats) {
                // Add skillz
                replicaBodyStats = item.BodyStats
                    .Where(m => m.Extra != null)
                    .Select(ToJsonStat)
                    .ToHashSet()
                    .ToList();
            }

            var json = new JsonItem {
                UniqueIdentifier = uniqueIdentifier,
                MergeIdentifier = mergeIdentifier,
                BaseRecord = item.BaseRecord ?? string.Empty,
                URL = transferUrl,
                Icon = item.Bitmap ?? string.Empty,
                Name = PureItemName(item.Name ?? string.Empty) ?? string.Empty,
                NameCore = CoreName(item) ?? string.Empty,
                PrefixTag = AffixTag(item, item.PrefixRecord),
                SuffixTag = AffixTag(item, item.SuffixRecord),
                Quality = item.Rarity ?? string.Empty,
                Level = item.MinimumLevel,
                Socket = GetSocketFromItem(item.Name ?? string.Empty) ?? string.Empty,
                PetStats = skipStats ? new List<JsonStat>() : item.PetStats.Select(ToJsonStat).ToHashSet().ToList(),
                BodyStats = skipStats ? replicaBodyStats : item.BodyStats.Select(ToJsonStat).ToHashSet().ToList(),
                HeaderStats = skipStats ? new List<JsonStat>() : item.HeaderStats.Select(ToJsonStat).ToHashSet().ToList(),
                Type = type,
                HasRecipe = item.HasRecipe,
                Skill = (item.Skill != null && !skipStats) ? GetJsonSkill(item.Skill) : null,
                GreenRarity = (int)item.PrefixRarity,
                HasCloudBackup = isCloudSynced,
                Slot = SlotTranslator.Translate(RuntimeSettings.Language!, item.Slot ?? ""),
                Extras = extras,
                IsMonsterInfrequent = item.ModifiedSkills.Any(s => s.IsMonsterInfrequent),
                IsHardcore = isHardcore,
                ReplicaStats = replicaStats,
            };

            if (!skipStats) {
                var modifiedSkills = item.ModifiedSkills;
                foreach (var modifiedSkill in modifiedSkills) {
                    var translated = modifiedSkill.Translated;
                    foreach (var stat in translated.Select(ToJsonStat)) {
                        json.BodyStats.Add(stat);
                    }
                }
            }


            return json;
        }

        /// <summary>
        /// Whether the destination already holds this exact file. Length plus write time is what every installer and
        /// sync tool uses for this; hashing 15 MB on every launch would cost more than the copy it saves.
        /// </summary>
        private static bool IsUpToDate(string source, string destination) {
            try {
                var dest = new FileInfo(destination);
                if (!dest.Exists) {
                    return false;
                }

                var src = new FileInfo(source);
                return src.Length == dest.Length && src.LastWriteTimeUtc == dest.LastWriteTimeUtc;
            }
            catch (Exception ex) {
                // Any doubt about the destination's state and we copy; being wrong here only costs the copy we
                // were going to do anyway, while skipping a file that needed updating leaves a stale UI on disk.
                Logger.Debug($"Could not compare \"{source}\" against \"{destination}\", copying it: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Copy any css/js files from the app\resource folder to the items working directory
        /// </summary>
        public static void CopyMissingFiles() {
            Logger.Debug("Copying missing files / etc to IA storage folder");
            string appResFolder = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "resources");

            foreach (string dirPath in Directory.GetDirectories(appResFolder, "*", SearchOption.AllDirectories)) {
                Directory.CreateDirectory(dirPath.Replace(appResFolder, GlobalPaths.StorageFolder));
            }

            // Only the files that are actually missing or stale. This runs on every launch and the resource folder
            // is ~15 MB, so copying it wholesale spent real time re-writing bytes that were already identical.
            var copied = 0;
            foreach (string newPath in Directory.GetFiles(appResFolder, "*.*", SearchOption.AllDirectories)) {
                var destination = newPath.Replace(appResFolder, GlobalPaths.StorageFolder);

                if (IsUpToDate(newPath, destination)) {
                    continue;
                }

                File.Copy(newPath, destination, true);
                copied++;
            }

            Logger.Debug($"Copy complete, {copied} file(s) updated");
        }

        public static List<List<JsonItem>> ToJsonSerializable(List<List<PlayerHeldItem>> items) {
            List<List<JsonItem>> result = new List<List<JsonItem>>(items.Count);
            foreach (List<PlayerHeldItem> itemList in items) {
                result.Add(itemList.Select(GetJsonItem).ToList());
            }

            return result;
        }


        private static string GetSocketFromItem(string name) {
            if (!string.IsNullOrEmpty(name) && name.Contains("[")) {
                string[] tmp = name.Split('[');
                return $"({tmp[1].Replace("]", "")})";
            }
            else {
                return string.Empty;
            }
        }


        /// <summary>
        /// Strip any socket from item name
        /// </summary>
        /// <param name="name"></param>
        /// <returns></returns>
        /// <summary>
        /// 前缀/后缀的 tag 名（如 `tagPrefixB001_Sh_A`）。
        ///
        /// 词缀的**显示文本**不从这里取——那是前端用我们自己的词缀表查的
        /// （见 .docs/12-装备显示与交互.md）。这里只给出"是哪条词缀"。
        /// </summary>
        private static string? AffixTag(PlayerHeldItem item, string? record) {
            if (string.IsNullOrEmpty(record) || item.Tags == null) {
                return null;
            }

            return item.Tags
                .FirstOrDefault(t => t.Record == record && t.Stat == "lootRandomizerName")
                ?.TextValue;
        }

        /// <summary>
        /// **纯基础名**（不含前后缀），如 "保护者 胸铠"。
        ///
        /// 取自游戏数据里基础物品自己的 `itemNameTag`（少数物品如药水用
        /// `description`，与 GetItemName 的取值顺序一致），再用当前语言翻译。
        /// 这样前端可以自己拼"前缀 + 基础名 + 后缀"，而不必去减 item.Name
        /// ——那个减法在两套汉化包的词缀文本不同时会失效。
        /// </summary>
        private static string? CoreName(PlayerHeldItem item) {
            if (item.Tags == null) {
                return null;
            }

            string? TagOf(string stat) =>
                item.Tags.FirstOrDefault(t => t.Record == item.BaseRecord && t.Stat == stat)?.TextValue;

            string Translate(string? tag) {
                if (string.IsNullOrEmpty(tag)) {
                    return string.Empty;
                }

                var translated = RuntimeSettings.Language?.GetTag(tag);
                return string.IsNullOrEmpty(translated) ? tag : translated;
            }

            // ⚠️ 基础名**不只是** itemNameTag：游戏的名字是
            //    prefix + quality + style + name + suffix
            //    （见汉化包 tags_items.txt 第一行的 {%_s0}…{%_s4} 模板）。
            //    例如"保护者 马裤"里"保护者"来自 itemQualityTag、"马裤"才是 itemNameTag。
            //    少拼 quality 就会变成光秃秃的"马裤"（实测踩到）。
            var quality = Translate(TagOf("itemQualityTag"));
            var style = Translate(TagOf("itemStyleTag"));
            var name = Translate(TagOf("itemNameTag"));

            if (string.IsNullOrEmpty(name)) {
                // 少数物品（药水之类）没有 itemNameTag，用 description
                name = Translate(TagOf("description"));
            }

            if (string.IsNullOrEmpty(quality) && string.IsNullOrEmpty(style) && string.IsNullOrEmpty(name)) {
                return null;
            }

            // 用与 GetItemName 相同的模板组装，只是不带前缀后缀
            var localized = RuntimeSettings.Language?.TranslateName(string.Empty, quality, style, name, string.Empty);
            return string.IsNullOrEmpty(localized) ? name : localized;
        }

        private static string PureItemName(string name) {
            if (!string.IsNullOrEmpty(name) && name.Contains("[")) {
                string[] tmp = name.Split('[');
                return tmp[0].Trim();
            }
            else {
                return name;
            }
        }
    }
}