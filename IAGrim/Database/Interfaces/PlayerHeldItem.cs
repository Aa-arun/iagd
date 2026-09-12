using IAGrim.Services.Dto;
using StatTranslator;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using IAGrim.Database.Model;

namespace IAGrim.Database.Interfaces {
    public interface PlayerHeldItem : IComparable {
        Int64 Id { get; }
        string? Stash { get; }
        bool IsRecipe { get; }
        bool HasRecipe { get; set;}

        // The names of buddies who has this item
        ulong Count { get; set; }
        string? Name { get; }
        string? BaseRecord { get; }

        /// <summary>
        /// 前缀/后缀的 record 路径。用来查它们的 tag（进而查我们的词缀表）。
        /// `PlayerItem` 本来就实现了 `RecordCollection` 的同名属性，这里只是
        /// 在接口上暴露出来，让 ItemHtmlWriter 能拿到。
        /// </summary>
        string? PrefixRecord { get; }
        string? SuffixRecord { get; }

        long PrefixRarity { get; }


        string? Rarity { get; }

        float MinimumLevel { get; }
        string Slot { get; }
        bool IsKnown { get; }

        IList<TranslatedStat> HeaderStats { get; }
        IList<TranslatedStat> BodyStats { get; }
        IList<TranslatedStat> PetStats { get; }

        List<SkillModifierStat> ModifiedSkills { get; }

        string Bitmap { get; }

        ISet<DBStatRow>? Tags {
            get;
            set;
        }

        PlayerItemSkill? Skill { get; }
    }
}
