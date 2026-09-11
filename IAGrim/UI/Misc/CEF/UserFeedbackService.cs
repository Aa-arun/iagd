using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using EvilsoftCommons;
using log4net;

namespace IAGrim.UI.Misc.CEF {
    public class UserFeedbackService {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(UserFeedbackService));
        private readonly List<LogHistoryEntry> _history = new List<LogHistoryEntry>();
        private LogHistoryEntry? _previousEntry;
        /// <summary>
        /// 解耦 A1：这里原来是具体的 `CefBrowserHandler`（WebView2 宿主）。
        /// 改成接口后，反馈通道可以是 WS、控制台或测试替身，与 WebView2 无关。
        /// </summary>
        private readonly IUserFeedbackHandler _feedback;

        public UserFeedbackService(IUserFeedbackHandler feedback) {
            _feedback = feedback;
        }

        public void SetFeedback(List<UserFeedback> feedbacks) {
            foreach (var entry in feedbacks) {

                if (!IsRecent(entry)) {
                    if (!string.IsNullOrEmpty(entry.URL)) {
                        _feedback.ShowMessage(entry.Message ?? string.Empty, entry.Level, entry.URL);
                        Logger.Info($"Feedback {entry.Message}");
                    }
                    else {
                        _feedback.ShowMessage(entry.Message ?? string.Empty, entry.Level);
                        Logger.Info($"Feedback {entry.Message}");
                    }

                    var stored = new LogHistoryEntry() {
                        Message = entry.Message,
                        Timestamp = DateTime.UtcNow.ToTimestamp()
                    };

                    _history.Add(stored);
                    _previousEntry = stored;
                }
            }
        }

        private bool IsRecent(UserFeedback entry) {
            ClearRecent();
            return _history.Any(e => entry.Message == e.Message) || entry.Message == _previousEntry?.Message;
        }

        private void ClearRecent() {
            var cutoff = DateTime.UtcNow.ToTimestamp() - 4500;
            _history.RemoveAll(entry => entry.Timestamp < cutoff);
        }

        class LogHistoryEntry {
            public long Timestamp { get; set; }
            public string? Message { get; set; }
        }

        public void SetFeedback(string level, string feedback, string helpUrl) {
            _feedback.ShowMessage(feedback, UserFeedbackLevel.Info, helpUrl);
        }

        public void SetFeedback(string feedback) {
            _feedback.ShowMessage(feedback, UserFeedbackLevel.Info);
        }
    }
}
