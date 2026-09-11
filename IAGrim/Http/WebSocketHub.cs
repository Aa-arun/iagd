using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using log4net;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace IAGrim.Http {

    /// <summary>
    /// 本地 WebSocket 广播中心（线 B / B2）。
    ///
    /// ⚠️ **不要和 `_webSocketSyncService` 搞混**：那个是连云备份服务器（原作者那台）
    /// 做多机同步的，跟本机浏览器界面没有任何关系。这个只服务
    /// `127.0.0.1:3031` 上的本地前端。
    ///
    /// ★ 协议取向（2026-09-12 决定，见 .docs/05-实施计划.md §6）：
    /// **WS 只发轻量信号，数据仍然走 REST**。
    ///
    /// 原本的构想是"沿用 `IOMessage` 枚举，只换传输层"，但那个前提已经不存在了——
    /// 旧枚举是喂给 Preact 前端的，而新前端是重写的 React，**从来没有消费过它**
    /// （连 `core.SignalReady()` 都不调）。沿用枚举省不下任何工作量，反而要把
    /// `SetItems` 那种整份物品列表塞进推送里。所以这里只广播"发生了什么"，
    /// 前端收到信号后自己用 REST 取它需要的那一份。
    /// </summary>
    internal class WebSocketHub : IDisposable {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(WebSocketHub));

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings {
            ReferenceLoopHandling = ReferenceLoopHandling.Ignore,
            Culture = System.Globalization.CultureInfo.InvariantCulture,
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
        };

        /// <summary>
        /// 一个客户端。
        ///
        /// `SendLock` 是必须的：WebSocket **不允许并发 SendAsync**，
        /// 而 `Broadcast` 可能被多个线程同时调用（UI 线程拾取入库、HTTP 请求线程转移物品…）。
        /// </summary>
        private class Client {
            public required WebSocket Socket { get; init; }
            public SemaphoreSlim SendLock { get; } = new SemaphoreSlim(1, 1);
        }

        private readonly ConcurrentDictionary<Guid, Client> _clients = new ConcurrentDictionary<Guid, Client>();

        public int ClientCount => _clients.Count;

        public Guid Add(WebSocket socket) {
            var id = Guid.NewGuid();
            _clients[id] = new Client { Socket = socket };
            Logger.Info($"WebSocket 客户端已连接，当前 {_clients.Count} 个");
            return id;
        }

        public void Remove(Guid id) {
            if (_clients.TryRemove(id, out _)) {
                Logger.Info($"WebSocket 客户端已断开，当前 {_clients.Count} 个");
            }
        }

        /// <summary>
        /// 广播一条消息给所有已连接的前端。
        ///
        /// **刻意不等待发送完成**：调用方多半是 UI 线程（物品入库）或 HTTP 请求线程，
        /// 让它们去等网络 I/O 没有好处。客户端断开或发送失败就地清理。
        /// </summary>
        public void Broadcast(object payload) {
            if (_clients.IsEmpty) {
                return;
            }

            var bytes = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(payload, JsonSettings));

            foreach (var entry in _clients) {
                var id = entry.Key;
                var client = entry.Value;

                if (client.Socket.State != WebSocketState.Open) {
                    _clients.TryRemove(id, out _);
                    continue;
                }

                _ = Task.Run(async () => {
                    await client.SendLock.WaitAsync().ConfigureAwait(false);
                    try {
                        if (client.Socket.State == WebSocketState.Open) {
                            await client.Socket
                                .SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None)
                                .ConfigureAwait(false);
                        }
                    }
                    catch (Exception ex) {
                        // 前端刷个页面就会断开，这是常态，不是错误。
                        Logger.Debug($"WebSocket 发送失败，移除该客户端：{ex.Message}");
                        _clients.TryRemove(id, out _);
                    }
                    finally {
                        client.SendLock.Release();
                    }
                });
            }
        }

        public void Dispose() {
            foreach (var client in _clients.Values) {
                try {
                    client.Socket.Dispose();
                }
                catch (Exception ex) {
                    Logger.Debug($"关闭 WebSocket 客户端时出错：{ex.Message}");
                }

                client.SendLock.Dispose();
            }

            _clients.Clear();
        }
    }
}
