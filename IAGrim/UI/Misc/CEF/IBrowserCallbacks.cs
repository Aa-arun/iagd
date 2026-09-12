using System.Collections.Generic;
using IAGrim.Services.ItemReplica;

namespace IAGrim.UI.Misc.CEF {

    /// <summary>
    /// 后端主动发给界面的**信号**。
    ///
    /// 只剩两个还有发送方的：物品的云端同步状态变了、某件物品的属性补算好了。
    ///
    /// 曾经这里还有 `SetItems` / `AddItems` / `ShowLoadingAnimation` / `SetCollectionItems` 等一批
    /// ——那是**旧 Preact 前端**的推送接口（把整份搜索结果塞给页面）。它们的接收方随 WebView2 一起消失，
    /// 调用方（`SearchController` 的推送通路）也随旧界面删除：新前端自己用 REST 查、用 WebSocket 收通知。
    /// </summary>
    public interface IBrowserCallbacks {
        void SignalCloudIconChange(IList<long> playerItemIds);

        void SignalReplicaStatChange(long playerItemId, IList<ItemStatInfo> stats);
    }
}
