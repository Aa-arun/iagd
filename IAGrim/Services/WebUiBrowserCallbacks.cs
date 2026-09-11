using System.Collections.Generic;
using IAGrim.Database.Model;
using IAGrim.Services.ItemReplica;
using IAGrim.UI.Controller.dto;
using IAGrim.UI.Misc.CEF;
using log4net;

namespace IAGrim.Services {

    /// <summary>
    /// `IBrowserCallbacks` 的"新前端"实现（线 B / 解耦 A3）。
    ///
    /// `BackupService` 与 `ItemReplicaParser` 需要这个接口，而它原来的实现是
    /// `CefBrowserHandler`——**WebView2 的宿主**。为了删掉 WebView2，这里提供一个
    /// 不依赖任何 UI 的版本。
    ///
    /// ★ 为什么绝大部分是 no-op：
    ///   `IBrowserCallbacks` 是给**旧 Preact 前端**设计的推送接口，核心是
    ///   `SetItems`（把整份搜索结果推给页面）。而新前端是 React，自己用 REST 查询
    ///   （见 .docs/03-目标架构.md §4.3 的协议决定）。所以那些方法在新架构下
    ///   **本来就没有接收方**，实现成空操作既省带宽也不会丢功能。
    ///
    /// ⚠️ `IsReady()` 返回 **true**，不是 false：调用方（如 `ItemReplicaParser`）
    ///   会用它决定"要不要干活"。在旧实现里它反映 WebView2 是否就绪；这里没有
    ///   界面要等，所以永远就绪。
    /// </summary>
    internal class WebUiBrowserCallbacks : IBrowserCallbacks {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(WebUiBrowserCallbacks));

        public bool IsReady() => true;

        public void AddItems(List<List<JsonItem>> items, bool hasMore, int numItemsFound = -1) {
            // 新前端自己分页查询，不需要后端推列表
        }

        public void SetItems(List<List<JsonItem>> items, int numItemsFound, bool hasMore, bool numItemsApproximate = false) {
            // 同上
        }

        public void SetCollectionItems(IList<CollectionItem> items, bool isHardcore) {
            // 图鉴页已删除（2026-09-12 使用者确认不需要）
        }

        public void SetCollectionAggregateData(IList<CollectionItemAggregateRow> rows) {
            // 同上
        }

        public void ShowLoadingAnimation(bool visible) {
            // 长任务改用 WebSocket 的维护遮罩（WebServer.EnterMaintenance）
        }

        public void ShowModFilterWarning(int numOtherItems) {
            Logger.Debug($"存在 {numOtherItems} 件属于其它 mod 的物品（新前端暂不提示）");
        }

        public void SignalCloudIconChange(IList<long> playerItemIds) {
            // 云备份相关的图标；使用者已选择不用原作者的云服务
        }

        public void SignalReplicaStatChange(long playerItemId, IList<ItemStatInfo> stats) {
            // 物品属性是**查询时**由 ItemStatService 算好的（见 SearchController.QueryItems），
            // 所以不需要这种"稍后补推"的机制。
        }
    }
}
