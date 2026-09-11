using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using IAGrim.Settings;
using log4net;

namespace IAGrim.UI.Misc {
    class MinimizeToTrayHandler : IDisposable {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(MinimizeToTrayHandler));
        private FormWindowState _previousWindowState = FormWindowState.Normal;
        private Form? _form;
        private readonly NotifyIcon _notifyIcon;
        private readonly SettingsService _settingsService;

        public MinimizeToTrayHandler(Form form, NotifyIcon notifyIcon, SettingsService settingsService) {
            _form = form;
            _notifyIcon = notifyIcon;
            _settingsService = settingsService;
            _form.SizeChanged += OnMinimizeWindow;
            _notifyIcon.MouseDoubleClick += new System.Windows.Forms.MouseEventHandler(this.notifyIcon_MouseDoubleClick);
            _previousWindowState = _form.WindowState;

            // 界面已经搬到浏览器里，程序本体是**常驻后台服务**——
            // 所以托盘图标从一开始就可见：它是"服务正在运行"的唯一标识。
            _notifyIcon.Visible = true;

            if (_settingsService.GetLocal().StartMinimized) {
                form.WindowState = FormWindowState.Minimized;

                if (MinimizeToTray) {
                    form.Load += (sender, args) => form.Hide();
                }
            }
        }

        public bool MinimizeToTray => _settingsService.GetPersistent().MinimizeToTray;

        /// <summary>
        /// 双击托盘图标 → 在系统浏览器里打开 web UI。
        ///
        /// 不再是"唤回 WinForms 窗口"：那个窗口已经不再承载界面
        /// （见 .docs/03-目标架构.md 的技术路线，B6 会把它彻底移除）。
        /// </summary>
        public void notifyIcon_MouseDoubleClick(object? sender, MouseEventArgs? e) {
            OpenWebUi();
        }

        /// <summary>用系统默认浏览器打开 web UI。只监听 127.0.0.1，本机之外不可达。</summary>
        public static void OpenWebUi() {
            try {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo {
                    FileName = $"http://127.0.0.1:{IAGrim.Http.WebServer.Port}/",
                    UseShellExecute = true,
                });
            }
            catch (Exception ex) {
                Logger.Warn("打开 web UI 失败：" + ex.Message);
            }
        }

        /// <summary>
        /// Minimize to tray
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void OnMinimizeWindow(object? sender, EventArgs e) {
            try {
                if (_form == null) return;
                if (MinimizeToTray) {
                    if (_form.WindowState == FormWindowState.Minimized) {
                        _form.Hide();
                        _notifyIcon.Visible = true;
                    }
                    else {
                        _notifyIcon.Visible = false;
                        _previousWindowState = _form.WindowState;
                    }
                }
            }
            catch (Exception ex) {
                Logger.Warn(ex.Message);
                Logger.Warn(ex.StackTrace);
            }
        }

        public void Dispose() {
            var f = _form;
            if (f != null) {
                f.SizeChanged -= OnMinimizeWindow;
            }

            _form = null;
        }
    }
}