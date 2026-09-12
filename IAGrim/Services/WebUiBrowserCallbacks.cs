using System.Collections.Generic;
using IAGrim.Services.ItemReplica;
using IAGrim.UI.Misc.CEF;
using log4net;

namespace IAGrim.Services {

    /// <summary>
    /// <see cref="IBrowserCallbacks"/> 的实现（不依赖任何 UI，因为 WebView2 已经删了）。
    ///
    /// ★ 为什么是 no-op：那些信号本来是给**旧 Preact 前端**用的图标/属性提示。
    ///   新前端不消费它们——云备份已改用自建方案；物品属性是**查询时**由 `ItemStatService` 算好的
    ///   （见 `SearchController.QueryItems`），不需要"稍后补推"。
    ///   保留实现只为不动 `BackupService` / `ItemReplicaParser` 的调用点。
    /// </summary>
    internal class WebUiBrowserCallbacks : IBrowserCallbacks {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(WebUiBrowserCallbacks));

        public void SignalCloudIconChange(IList<long> playerItemIds) {
            // 界面没有"云端图标"要更新
            Logger.Debug($"云端同步状态变化：{playerItemIds?.Count ?? 0} 件");
        }

        public void SignalReplicaStatChange(long playerItemId, IList<ItemStatInfo> stats) {
            // 属性是查询时算好的，不需要补推
        }
    }
}
