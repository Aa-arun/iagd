using System.Collections.Generic;
using IAGrim.Services.ItemReplica;

namespace IAGrim.UI.Misc.CEF {

    /// <summary>
    /// 后端主动发给界面的**信号**。
    ///
    /// 只有两个：物品的云端同步状态变了、某件物品的属性补算好了。
    /// 新前端不消费它们（自己用 REST 查、用 WebSocket 收通知），所以实现是 no-op——
    /// 保留接口只为不动 `BackupService` / `ItemReplicaParser` 的调用点。
    /// </summary>
    public interface IBrowserCallbacks {
        void SignalCloudIconChange(IList<long> playerItemIds);

        void SignalReplicaStatChange(long playerItemId, IList<ItemStatInfo> stats);
    }
}
