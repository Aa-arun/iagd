/**
 * 后端事件推送（线 B / B2）。
 *
 * ★ 协议：C# 侧 `/ws` **只发轻量信号**，不带数据。数据仍然走 REST
 * （见 `IAGrim/Http/WebSocketHub.cs` 的类注释）。
 *
 * 目前有两种消息：
 * - `{ type: 'itemsChanged' }` —— 物品数据库变了（游戏里捡到东西、
 *   转移走了物品、重新解析了游戏数据），前端应当重查当前列表。
 * - `{ type: 'maintenance', active, message }` —— 后端正在重建游戏数据库
 *   （清库 + 解析几分钟）。这期间查询会被拒（503），界面要显示遮罩。
 *
 * ⚠️ **连不上不算致命**：`App.tsx` 在断连期间会回退到轮询。
 * 这也是为什么这里要一直重连——它决定了界面是"实时"还是"最多 4 秒延迟"。
 */

/** 后端推来的消息。 */
type LiveMessage =
  | { type: 'itemsChanged' }
  | { type: 'maintenance'; active: boolean; message?: string };

export interface LiveHandlers {
  /** 数据库变了，去重查当前列表 */
  onItemsChanged: () => void;
  /** 进入/退出维护模式。`message` 是要显示给使用者的说明 */
  onMaintenance?: (active: boolean, message: string) => void;
  /** 连接状态变化。用来决定"要不要回退到轮询" */
  onStatus?: (connected: boolean) => void;
}

/** 首次重连延迟，之后翻倍。后端重启时不该把 CPU 打满。 */
const RETRY_INITIAL_MS = 500;
const RETRY_MAX_MS = 15000;

/**
 * 连上后端的事件推送，返回一个断开函数。
 *
 * 自动重连，直到调用返回的那个函数。
 */
export function connectLive(handlers: LiveHandlers): () => void {
  let socket: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = RETRY_INITIAL_MS;
  let disposed = false;

  // 前端由 C# 自己托管，所以永远同源——直接按当前页面的 host 拼即可。
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${scheme}://${window.location.host}/ws`;

  const open = () => {
    if (disposed) return;

    socket = new WebSocket(url);

    socket.onopen = () => {
      retryDelay = RETRY_INITIAL_MS;
      handlers.onStatus?.(true);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as LiveMessage;
        if (message.type === 'itemsChanged') {
          handlers.onItemsChanged();
        } else if (message.type === 'maintenance') {
          handlers.onMaintenance?.(message.active, message.message ?? '正在更新游戏数据库…');
        }
      } catch {
        /* 不是 JSON 就忽略：推送通道不该因为一条坏消息把界面搞崩 */
      }
    };

    socket.onclose = () => {
      handlers.onStatus?.(false);
      if (disposed) return;

      retryTimer = setTimeout(open, retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    };

    // onerror 之后浏览器一定会再触发 onclose，重连逻辑统一放在那边，
    // 这里只是确保连接不会被留在半开状态。
    socket.onerror = () => socket?.close();
  };

  open();

  return () => {
    disposed = true;
    clearTimeout(retryTimer);
    socket?.close();
  };
}
