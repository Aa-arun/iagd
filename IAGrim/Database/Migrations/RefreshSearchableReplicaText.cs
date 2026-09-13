using System;
using System.Linq;
using IAGrim.Services.ItemReplica;
using log4net;
using NHibernate;

namespace IAGrim.Database.Migrations {
    /// <summary>
    /// 把 `ReplicaItemRow.TextLowercase`（wildcard 搜索用的文本）按**当前规则**重算一遍。
    ///
    /// ★ 为什么需要：搜索用的是 `IFNULL(TextLowercase, Text)` 做**子串**匹配，
    ///   而 tooltip 里有些内容**界面上根本不显示**——`^s(English Name)` 是英文技能名，
    ///   前端用 CSS（`.tt-s { display: none }`）把它藏起来了。它却留在搜索文本里，
    ///   于是搜 "LS" 会命中 `chi**ls**urge`（Chillsurge）这种**看不见的东西**
    ///   （使用者 2026-09-14 报的："搜 LS 出来了很多无关的选项"）。
    ///
    /// 数据量很小（实测 2548 行），所以**每次启动都重算**：幂等，而且永远与
    /// `ReplicaTextFormatter.Searchable` 的规则保持一致；只有真的变了才写回。
    /// </summary>
    class RefreshSearchableReplicaText : IDatabaseMigration {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(RefreshSearchableReplicaText));

        public override void Migrate(SessionFactory sessionCreator) {
            using ISession session = sessionCreator.OpenSession();
            var rows = session.Query<ReplicaItemRow>().ToList();
            var updated = 0;

            using ITransaction transaction = session.BeginTransaction();
            foreach (var row in rows) {
                var expected = ReplicaTextFormatter.Searchable(row.Text);
                if (!string.Equals(row.TextLowercase, expected, StringComparison.Ordinal)) {
                    row.TextLowercase = expected;
                    updated++;
                }
            }
            transaction.Commit();

            if (updated > 0) {
                Logger.Info($"刷新了 {updated} 行 replica 搜索文本（去掉界面上不显示的英文技能名）");
            }
        }
    }
}
