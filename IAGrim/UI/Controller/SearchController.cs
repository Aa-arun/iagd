using System.Collections.Generic;
using System.Linq;
using IAGrim.Database;
using IAGrim.Database.DAO.Util;
using IAGrim.Database.Dto;
using IAGrim.Database.Interfaces;
using IAGrim.Services;
using IAGrim.UI.Controller.dto;
using IAGrim.Utilities;

namespace IAGrim.UI.Controller {

    /// <summary>
    /// 物品检索。
    ///
    /// ★ 只有一条通路：<see cref="QueryItems"/> 把一次查询的结果**作为数据**返回（供 HTTP 层用）。
    /// 曾经还有第二条"推给 WebView2"的通路（`Browser` 回调 + 两个 `Search()` 重载 + 跨批分页状态），
    /// 随旧界面一起删除了——新前端自己知道在看什么（搜索词、分页），不需要后端替它维护。
    /// </summary>
    public class SearchController {
        private readonly IPlayerItemDao _playerItemDao;
        private readonly ItemStatService _itemStatService;

        public SearchController(IPlayerItemDao playerItemDao, ItemStatService itemStatService) {
            _playerItemDao = playerItemDao;
            _itemStatService = itemStatService;
        }

        /// <summary>
        /// 查一页物品，走完整链路：DAO 查询 → 副本/宠物信息 → 属性翻译 → <see cref="JsonItem"/>。
        ///
        /// ⚠️ `offset > 0` 时必须让 DAO 真的去 COUNT：分页取行时"这一页没满"推不出总数
        /// （DAO 里那条零成本的捷径只在 `skip == 0` 时成立）。首页不付这次全表扫描。
        /// </summary>
        public List<JsonItem> QueryItems(
            ItemSearchRequest query,
            int offset,
            int limit,
            out int total,
            out bool truncated) {
            var page = _playerItemDao.SearchForItems(query, offset, query.OrderByLevel, offset > 0, out total, out truncated);

            var playerItems = page.OfType<PlayerItem>().ToList();
            _playerItemDao.PopulateReplicaAndPetInfo(playerItems);

            var merged = ItemOperationsUtility.MergeStackSize(page);
            _itemStatService.ApplyStats(merged.SelectMany(m => m));

            // ToJsonSerializable 返回的是**分组**结构（同一件物品的多份副本在一组），
            // REST 这边摊平即可——前端本来就是按件渲染的。
            var flattened = ItemHtmlWriter.ToJsonSerializable(merged).SelectMany(group => group);

            // SearchForItems 有自己的分页上限（MaxSearchResults），这里再按调用方要求截断。
            return limit > 0 ? flattened.Take(limit).ToList() : flattened.ToList();
        }
    }
}
