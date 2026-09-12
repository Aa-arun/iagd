using System.Collections.Generic;
using System.Linq;
using IAGrim.Database.Interfaces;
using IAGrim.Database.Model;
using log4net;
using NHibernate;
using NHibernate.Type;

namespace IAGrim.Database.DAO {
    /// <summary>
    /// Persists the pre-computed, seed-applied stat values used for fast in-database stat filtering.
    /// See <see cref="ComputedItemStat"/>.
    /// </summary>
    public class ComputedItemStatDaoImpl : BaseDao<ComputedItemStat>, IComputedItemStatDao {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(ComputedItemStatDaoImpl));

        public ComputedItemStatDaoImpl(SessionFactory sessionCreator) : base(sessionCreator) {
        }

        public void SaveComputed(long playerItemId, IReadOnlyDictionary<string, double>? stats) {
            using (ISession session = SessionCreator.OpenSession()) {
                using (ITransaction transaction = session.BeginTransaction()) {
                    session.CreateSQLQuery("DELETE FROM ComputedItemStat WHERE playeritemid = :pid")
                        .SetParameter("pid", playerItemId)
                        .ExecuteUpdate();

                    if (stats != null) {
                        foreach (var kv in stats) {
                            session.Save(new ComputedItemStat {
                                PlayerItemId = playerItemId,
                                Stat = kv.Key,
                                Value = kv.Value,
                            });
                        }
                    }

                    // Always leave a marker so a fully-unmodeled / seedless item is not re-processed forever.
                    session.Save(new ComputedItemStat {
                        PlayerItemId = playerItemId,
                        Stat = ComputedItemStat.SentinelStat,
                        Value = 1,
                    });

                    transaction.Commit();
                }
            }
        }

        public IList<PlayerItem> ListItemsMissingComputedStats(int limit) {
            using (ISession session = SessionCreator.OpenSession()) {
                return session.CreateQuery(
                        "from PlayerItem pi where not exists (from ComputedItemStat c where c.PlayerItemId = pi.Id)")
                    .SetMaxResults(limit)
                    .List<PlayerItem>();
            }
        }

        public void DeleteForPlayerItems(IEnumerable<long> playerItemIds) {
            var ids = playerItemIds?.ToList();
            if (ids == null || ids.Count == 0) {
                return;
            }

            using (ISession session = SessionCreator.OpenSession()) {
                using (ITransaction transaction = session.BeginTransaction()) {
                    session.CreateSQLQuery("DELETE FROM ComputedItemStat WHERE playeritemid IN (:ids)")
                        .SetParameterList("ids", ids)
                        .ExecuteUpdate();
                    transaction.Commit();
                }
            }
        }

        public void DeleteAll() {
            Logger.Info("Deleting all computed item stats");
            using (ISession session = SessionCreator.OpenSession()) {
                using (ITransaction transaction = session.BeginTransaction()) {
                    session.CreateSQLQuery("DELETE FROM ComputedItemStat").ExecuteUpdate();
                    transaction.Commit();
                }
            }
        }

        public IList<string> ListStatNames() {
            using (ISession session = SessionCreator.OpenSession()) {
                // (stat, value) 复合索引让 DISTINCT stat 变成一次索引扫描。
                // 哨兵行只表示"这件物品算过了"，不是真属性。
                return session.CreateSQLQuery(
                        "SELECT DISTINCT stat AS StatName FROM ComputedItemStat "
                        + "WHERE stat IS NOT NULL AND stat <> :sentinel")
                    .AddScalar("StatName", (IType)NHibernateUtil.String)
                    .SetParameter("sentinel", ComputedItemStat.SentinelStat)
                    .List<string>();
            }
        }
    }
}
