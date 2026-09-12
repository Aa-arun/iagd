using System;
using IAGrim.Http;
using IAGrim.Settings;
using IAGrim.UI.Misc;
using IAGrim.UI.Misc.CEF;
using log4net;

namespace IAGrim.Services {

    /// <summary>
    /// <see cref="IUserFeedbackHandler"/> 的"新前端"实现（线 B / 解耦 A1）。
    ///
    /// 这个角色原来由 `CefBrowserHandler` 兼任，而它是 **WebView2 的宿主**——
    /// 于是"显示一条提示"这种纯逻辑被绑死在浏览器控件上：只要 WebView2 起不来，
    /// 连"转移失败"都报不出来。这里改成用 WebSocket 推给页面
    /// （B2 已经把管道铺好了）。
    ///
    /// ⚠️ 与旧实现的差异：旧的还会 `Replace("\n", "\\n")` 转义——那是在拼
    /// `ExecuteScriptAsync` 的 JS 源码字符串，需要转义引号与换行。现在走 JSON，
    /// **不能**再转义，否则页面上会看到字面的 `\n`。
    /// </summary>
    internal class WebUiFeedbackHandler : IUserFeedbackHandler {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(WebUiFeedbackHandler));

        /// <summary>
        /// 用工厂而不是直接注入：HTTP 服务在 `AppHost` 装配的末尾才创建，
        /// 比这个处理器晚。
        /// </summary>
        private readonly Func<WebServer?> _webServer;
        private readonly SettingsService _settings;

        public WebUiFeedbackHandler(Func<WebServer?> webServer, SettingsService settings) {
            _webServer = webServer;
            _settings = settings;
        }

        public void ShowMessage(string message, UserFeedbackLevel level = UserFeedbackLevel.Info, string? helpUrl = null) {
            if (string.IsNullOrEmpty(message)) {
                return;
            }

            // 日志留着：这是排查"提示到底发出去没有"的唯一线索
            // （旧实现是靠 WebView2 那边的一行 WARN 判断的）。
            Logger.Info($"[{level}] {message}");

            // 语义沿用旧实现：程序在前台就自动淡出；否则留在屏幕上等用户回来看。
            var fade = IsProgramActive.IsActive() || _settings.GetPersistent().AutoDismissNotifications;

            _webServer()?.BroadcastNotification(message, level.ToString().ToLowerInvariant(), helpUrl, fade);
        }
    }
}
