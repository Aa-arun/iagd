using DllInjector;
using EvilsoftCommons;
using EvilsoftCommons.Cloud;
using EvilsoftCommons.DllInjector;
using EvilsoftCommons.Exceptions;
using EvilsoftCommons.SingleInstance;
using IAGrim.Backup.Cloud.CefSharp.Events;
using IAGrim.Backup.Cloud.Service;
using IAGrim.Backup.Cloud.Util;
using IAGrim.BuddyShare;
using IAGrim.Database;
using IAGrim.Database.Interfaces;
using IAGrim.Parsers.Arz;
using IAGrim.Parsers.GameDataParsing.Service;
using IAGrim.Parsers.TransferStash;
using IAGrim.Services;
using IAGrim.Services.ItemReplica;
using IAGrim.Services.ItemStats;
using IAGrim.Services.MessageProcessor;
using IAGrim.Settings;
using IAGrim.UI.Controller;
using IAGrim.UI.Misc;
using IAGrim.UI.Misc.CEF;
using IAGrim.UI.Popups;
using IAGrim.UI.Tabs;
using IAGrim.Utilities;
using IAGrim.Utilities.Cloud;
using IAGrim.Utilities.HelperClasses;
using log4net;
using System.Collections.Generic;
using System.ComponentModel;

namespace IAGrim.UI {
    public partial class MainWindow : Form {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(MainWindow));

        /// <summary>Users with fewer items than this are still getting set up, and don't need the numeric filter introduction.</summary>
        private const int NumericFilterBannerMinItems = 450;

        private readonly ServiceProvider _serviceProvider;
        private readonly UsageStatisticsReporter _usageStatisticsReporter = new UsageStatisticsReporter();
        private readonly AutomaticUpdateChecker _automaticUpdateChecker;
        private CharacterBackupService? _charBackupService;

        private readonly List<IMessageProcessor> _messageProcessors = new List<IMessageProcessor>();

        /// <summary>
        /// 解耦 A3：`IBrowserCallbacks`（旧 Preact 前端的推送接口）。
        /// `BackupService` / `ItemReplicaParser` 需要它，原来由 `_cefBrowserHandler` 兼任，
        /// 于是这两个后台服务被绑在 WebView2 上。
        /// </summary>
        private readonly WebUiBrowserCallbacks _browserCallbacks = new WebUiBrowserCallbacks();

        private CsvFileMonitor? _csvFileMonitor = new CsvFileMonitor();
        private CsvFileMonitor? _replicaCsvFileMonitor = new CsvFileMonitor();
        private ItemReplicaRequesterService? _itemReplicaService;
        private ItemStatPrecomputeService? _itemStatPrecomputeService;

        private Action<RegisterWindow.DataAndType>? _registerWindowDelegate;
        private RegisterWindow? _window;
        private InjectionHelper? _injector;
        private ProgressChangedEventHandler? _injectorCallbackDelegate;
        private CsvParsingService? _csvParsingService;
        private ItemReplicaParser? _itemReplicaParser;

        private BuddyItemsService? _buddyItemsService;
        private BackgroundTask? _backupBackgroundTask;
        private ItemTransferController? _transferController;
        private readonly ParsingService _parsingService;
        private AuthService? _authService;
        private BackupServiceWorker? _backupServiceWorker;
        private WebSocketSyncService? _webSocketSyncService;
        private readonly UserFeedbackService _userFeedbackService;

        /// <summary>
        /// 解耦 A1：给使用者看提示的通道。原来这个角色由 `_cefBrowserHandler` 兼任，
        /// 于是「显示一条提示」依赖 WebView2 活着——WebView2 起不来就什么都报不出来。
        /// </summary>
        private readonly WebUiFeedbackHandler _webUiFeedbackHandler;

        /// <summary>
        /// 解耦 A2：帮助链接。`CefBrowserHandler` 原来也兼任这个，
        /// 但项目里早就有不依赖 UI 的实现（`Services/HelpService.cs`，直接开系统浏览器）。
        /// </summary>
        private readonly IHelpService _helpService = new HelpService();
        private MinimizeToTrayHandler? _minimizeToTrayHandler;
        /// <summary>线 B（B1）：给系统浏览器用的 HTTP 服务（与 WebView2 路径并存）</summary>
        private Http.WebServer? _webServer;
        private ModsDatabaseConfig? _modsDatabaseConfigTab;
        private System.Windows.Forms.Timer? _wineMessageTimer;
        public static int NumInstantSyncItemCount = 300;


        #region Stash Status

        // TODO: TEMPORARY FIX!
        private bool _hasShownStashErrorPage = false;
        private bool _hasShownSeasonErrorPage = false;
        private bool _hasShownPathErrorPage = false;
        private bool _hasShown32bitErrorPage = false;

        // Set when we intentionally aborted an injection, so the follow-up INJECTION_ERROR isn't treated as a real failure.
        private bool _injectionAborted = false;

        // The DLL reports an abort out-of-band (WM_COPYDATA, or a polled file under Wine), so it can land *after*
        // the INJECTION_ERROR it was meant to excuse -- the aborted-flag check above then misses it entirely.
        // Requiring a run of failures instead means a game that is merely still loading no longer trips the
        // "stash error" help page, while a genuinely broken injection still reports within a few seconds.
        private const int InjectionErrorsBeforeHelpPage = 5;
        private int _consecutiveInjectionErrors = 0;

        /// <summary>
        /// Toolstrip callback for GDInjector
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void InjectorCallback(object? sender, ProgressChangedEventArgs e) {
            if (InvokeRequired) {
                Invoke((System.Windows.Forms.MethodInvoker) delegate { InjectorCallback(sender, e); });
            }
            else {
                switch (e.ProgressPercentage) {
                    case InjectionHelper.ABORTED:
                        _injectionAborted = true;
                        _consecutiveInjectionErrors = 0;
                        break;


                    case InjectionHelper.INJECTION_ERROR: {
                            if (_injectionAborted) {
                                // False positive, injection failed because we intentionally aborted. Consumed
                                // rather than left set: on Windows the abort arrives by WM_COPYDATA and can land
                                // just after the error it explains, but it only ever excuses that one error --
                                // leaving the flag up would swallow every genuine failure for the rest of the session.
                                _injectionAborted = false;
                                break;
                            }

                            statusLabel.Text = e.UserState as string;
                            _consecutiveInjectionErrors++;
                            if (!_hasShownStashErrorPage && _consecutiveInjectionErrors >= InjectionErrorsBeforeHelpPage) {
                                Logger.Error($"Injection has failed {_consecutiveInjectionErrors} times in a row, showing the stash error page.");
                                _helpService.ShowHelp(HelpService.HelpType.StashError);
                                _hasShownStashErrorPage = true;
                            }

                            break;
                        }


                    case InjectionHelper.GD_SEASON: {
                            if (!_hasShownSeasonErrorPage) {
                                _hasShownSeasonErrorPage = true;
                            }

                            break;
                        }

                    case InjectionHelper.PATH_ERROR: {
                            if (!_hasShownPathErrorPage) {
                                _helpService.ShowHelp(HelpService.HelpType.PathError);
                                _hasShownPathErrorPage = true;
                            }

                            break;
                        }

                    case InjectionHelper.INJECTION_ERROR_32BIT: {
                        statusLabel.Text = e.UserState as string;
                        if (!_hasShown32bitErrorPage) {
                            _helpService.ShowHelp(HelpService.HelpType.No32Bit);
                            _hasShown32bitErrorPage = true;
                        }

                        break;
                    }


                    // No grim dawn client running
                    case InjectionHelper.NO_PROCESS_FOUND:
                        _injectionAborted = false;
                        _consecutiveInjectionErrors = 0;
                        break;

                    // Injection error
                    case InjectionHelper.INJECTION_ERROR_POSSIBLE_ACCESS_DENIED: {
                        if (!_hasShownStashErrorPage) {
                            _helpService.ShowHelp(HelpService.HelpType.StashError);
                            _hasShownStashErrorPage = true;
                        }

                        break;
                    }
                    // Already injected, so whatever failed before has resolved itself.
                    case InjectionHelper.STILL_RUNNING:
                        _consecutiveInjectionErrors = 0;
                        break;
                }

                // Only back up characters while Grim Dawn isn't running (avoids reading save files mid-write).
                _charBackupService?.SetIsActive(e.ProgressPercentage == InjectionHelper.NO_PROCESS_FOUND);
            }
        }

        #endregion Stash Status

        public MainWindow(
            ServiceProvider serviceProvider,
            ParsingService parsingService
        ) {
            this._serviceProvider = serviceProvider;
            var settingsService = _serviceProvider.Get<SettingsService>();
            InitializeComponent();
            FormClosing += MainWindow_FormClosing;

            _minimizeToTrayHandler = new MinimizeToTrayHandler(this, notifyIcon1, serviceProvider.Get<SettingsService>());

            // 线 B（B5/B6）：旧界面删掉后，数据库 / Mods 维护窗口失去了入口——
            // 主窗口启动几秒后就被 Hide() 收进托盘，而托盘的双击与 Open 都是打开浏览器。
            // 这四个操作（加载数据库 / 配置 / 清除数据库 / 更新项目统计）留在 WinForms，
            // 所以必须给托盘菜单补一项。
            var maintenanceItem = new ToolStripMenuItem("数据库 / Mods（维护）");
            maintenanceItem.Click += (_, _) => ShowMaintenanceWindow();
            // 插在 Open 与 Exit 之间
            trayContextMenuStrip.Items.Insert(1, maintenanceItem);

            _automaticUpdateChecker = new AutomaticUpdateChecker(settingsService);
            _parsingService = parsingService;
            // 用闭包延迟取 `_webServer`：HTTP 服务要到 MainWindow_Load 末尾才创建。
            _webUiFeedbackHandler = new WebUiFeedbackHandler(() => _webServer, settingsService);
            _userFeedbackService = new UserFeedbackService(_webUiFeedbackHandler);

            // ⚠️ 必须**手动**跑一次装配，不能靠 `Load` 事件：
            //   主窗口永不显示（见 SetVisibleCore override），而 WinForms 的 `Load`
            //   只在窗体**首次显示**时触发——不显示就永远不触发，整个应用起不来
            //   （HTTP 服务、注入器、CSV 解析全都不会启动）。
            //
            //   放在构造函数末尾而不是更早：装配过程要读 Designer 已创建好的控件。
            MainWindow_Load(this, EventArgs.Empty);
        }

        public void UpdateLanguage() {
            LocalizationLoader.ApplyLanguage(Controls, RuntimeSettings.Language!);
            Refresh();
        }


        private void IterAndCloseForms(Control.ControlCollection controls) {
            foreach (Control c in controls) {
                Form? f = c as Form;
                if (f != null)
                    f.Close();

                IterAndCloseForms(c.Controls);
            }
        }

        private void MainWindow_FormClosing(object? sender, FormClosingEventArgs e) {
            // No idea which of these are triggering on rare occasions, perhaps Deactivate, sizechanged or filterWindow.
            FormClosing -= MainWindow_FormClosing;
            SizeChanged -= OnMinimizeWindow;

            _authService?.Dispose();
            _authService = null;

            _csvFileMonitor?.Dispose();
            _csvFileMonitor = null;

            _replicaCsvFileMonitor?.Dispose();
            _replicaCsvFileMonitor = null;

            _csvParsingService?.Dispose();
            _csvParsingService = null;

            _itemReplicaService?.Dispose();
            _itemReplicaService = null;

            _itemStatPrecomputeService?.Dispose();
            _itemStatPrecomputeService = null;

            _minimizeToTrayHandler?.Dispose();
            _minimizeToTrayHandler = null;

            _backupBackgroundTask?.Dispose();
            _usageStatisticsReporter.Dispose();
            _automaticUpdateChecker.Dispose();

            _buddyItemsService?.Dispose();
            _buddyItemsService = null;

            _injector?.Dispose();
            _injector = null;

            _wineMessageTimer?.Stop();
            _wineMessageTimer?.Dispose();
            _wineMessageTimer = null;

            _backupServiceWorker?.Dispose();
            _backupServiceWorker = null;
            _webSocketSyncService?.Dispose();
            _webSocketSyncService = null;

            _window?.Dispose();
            _window = null;

            _itemReplicaParser?.Dispose();
            _itemReplicaParser = null;

            IterAndCloseForms(Controls);
        }


        /// <summary>
        /// Callback called when the Grim Dawn hook sends messages to IA
        /// </summary>
        /// <returns></returns>
        private void CustomWndProc(RegisterWindow.DataAndType bt) {
            // Most if not all actions may interact with SQL
            // SQL is done on the UI thread.
            if (InvokeRequired) {
                Invoke((System.Windows.Forms.MethodInvoker) delegate { CustomWndProc(bt); });
                return;
            }

            MessageType type = (MessageType) bt.Type;
            foreach (IMessageProcessor t in _messageProcessors) {
                t.Process(type, bt.Data, bt.StringData);
            }

            switch (type) {

                case MessageType.TYPE_REPORT_WORKER_THREAD_LAUNCHED:
                    Logger.Info("Grim Dawn hook reports successful launch.");
                    break;


                case MessageType.TYPE_GameInfo_IsHardcore:
                case MessageType.TYPE_GameInfo_IsHardcore_via_init:
                    Logger.Info($"TYPE_GameInfo_IsHardcore({bt.Data[0] > 0}, {type})");

                    break;

                case MessageType.TYPE_GameInfo_SetModName:
                    Logger.InfoFormat("TYPE_GameInfo_SetModName({0})", IOHelper.GetPrefixString(bt.Data, 0));

                    break;
            }
        }

        /// <summary>
        /// 主窗口**永不显示**。
        ///
        /// 它现在只是个不可见的宿主：提供 WinForms 消息循环、给注入器回调与托盘图标
        /// 一个 `Invoke` 目标。界面全在浏览器里（见 .docs/10-界面解耦.md）。
        ///
        /// ⚠️ 为什么要在 `SetVisibleCore` 里拦：`Program.cs` 那句
        /// `_mw.Visible = false` 是**无效**的——`Application.Run(_mw)` 会把它重新
        /// 设为可见，于是启动时旧界面会**在屏幕上停留几秒**（原来是等 WebView2
        /// 初始化完成才 Hide）。使用者明确反馈过这一点。
        ///
        /// 注意这会连带让 `Shown` 事件不再触发，所以注入器改成在 Load 末尾启动。
        /// </summary>
        protected override void SetVisibleCore(bool value) {
            base.SetVisibleCore(false);
        }

        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            ShowExistingInstanceMessage.AllowReceiving(Handle);
        }

        protected override void WndProc(ref Message m) {
            if (ShowExistingInstanceMessage.Id != 0 && m.Msg == ShowExistingInstanceMessage.Id) {
                Logger.Info("A second instance was started, showing the existing window.");
                ShowAndCenterWindow();
            }

            base.WndProc(ref m);
        }

        /// <summary>
        /// Brings IA back up wherever it happens to be: minimized, hidden in the tray, or on a monitor
        /// that no longer exists. The window is centered on the screen the mouse is on, which is the screen
        /// the user just started IA from.
        /// </summary>
        private void ShowAndCenterWindow() {
            try {
                // Restores from the tray, including the window state it had before it was minimized.
                _minimizeToTrayHandler?.notifyIcon_MouseDoubleClick(this, null);

                Show();
                Visible = true;

                if (WindowState == FormWindowState.Minimized) {
                    WindowState = FormWindowState.Normal;
                }

                if (WindowState != FormWindowState.Maximized) {
                    var screen = Screen.FromPoint(Cursor.Position).WorkingArea;
                    Left = screen.Left + Math.Max(0, (screen.Width - Width) / 2);
                    Top = screen.Top + Math.Max(0, (screen.Height - Height) / 2);
                }

                Activate();
                BringToFront();
            }
            catch (Exception ex) {
                Logger.Warn("Error showing the window on request from a second instance", ex);
            }
        }

        private void SetFeedback(string feedback) {
            try {
                if (InvokeRequired) {
                    Invoke((System.Windows.Forms.MethodInvoker)delegate { SetFeedback(feedback); });
                }
                else {
                    statusLabel.Text = feedback.Replace("\\n", " - ");
                    _userFeedbackService.SetFeedback(feedback);
                }
            }
            catch (ObjectDisposedException) {
                Logger.Debug("Attempted to set feedback, but UI already disposed. (Probably shutting down)");
            }
        }

        private void SetInjectionAbortedStatus() {
            try {
                if (InvokeRequired) {
                    Invoke((System.Windows.Forms.MethodInvoker)SetInjectionAbortedStatus);
                }
                else {
                    InjectorCallback(null, new ProgressChangedEventArgs(InjectionHelper.ABORTED, null));
                    
                }
            }
            catch (ObjectDisposedException ex) {
                Logger.Warn(ex.ToString());
            }
        }


        private void TimerTickLookForGrimDawn(object? sender, EventArgs e) {
            System.Windows.Forms.Timer? timer = sender as System.Windows.Forms.Timer;
            if (Thread.CurrentThread.Name == null) {
                Thread.CurrentThread.Name = "DetectGrimDawnTimer";
                Thread.CurrentThread.CurrentUICulture = new System.Globalization.CultureInfo("en-US");
            }

            var grimDawnDetector = _serviceProvider.Get<GrimDawnDetector>();
            if (grimDawnDetector.GetGrimLocations().Count > 0) {
                timer?.Stop();
                var xyx = grimDawnDetector.GetGrimLocations();
                var gdPath = grimDawnDetector.GetGrimLocations().First();

                // Attempt to force a database update
                _modsDatabaseConfigTab?.ForceDatabaseUpdate(gdPath, string.Empty);

                Logger.InfoFormat("Found Grim Dawn at {0}", gdPath);
            }
        }

        /// <summary>
        /// 游戏数据库重新解析完成（由 `ModsDatabaseConfig` 解析后回调）。
        /// 界面部分随旧界面删除，这里只做与界面无关的收尾 + 通知浏览器。
        /// </summary>
        private void DatabaseLoadedTrigger() {
            _itemReplicaService?.Reset();

            // 线 B（B2）：重新解析游戏数据后，整库都变了。
            _webServer?.BroadcastItemsChanged();
        }

        private void MainWindow_Load(object sender, EventArgs e) {
            if (Thread.CurrentThread.Name == null) {
                Thread.CurrentThread.Name = "UI";
            }

            Logger.Debug("Starting UI initialization");


            // Set version number
            DateTime buildDate = ExceptionReporter.BuildDate;
            statusLabel.Text = statusLabel.Text + $" - {ExceptionReporter.VersionString} from {buildDate.ToString("dd/MM/yyyy")}";
            tsVersionNumber.Text = ExceptionReporter.VersionString;


            var settingsService = _serviceProvider.Get<SettingsService>();
            ExceptionReporter.EnableLogUnhandledOnThread();
            SizeChanged += OnMinimizeWindow;


            // Chicken and the egg.. search controller needs browser, browser needs search controllers var.
            var databaseItemDao = _serviceProvider.Get<IDatabaseItemDao>();
            var searchController = _serviceProvider.Get<SearchController>();
            var playerItemDao = _serviceProvider.Get<IPlayerItemDao>();
            var cacher = _serviceProvider.Get<TransferStashServiceCache>();
            _parsingService.OnParseComplete += (o, args) => cacher.Refresh();

            // 线 B：维护模式现在由 `MaintenanceService` 的状态驱动
            // （见 WebServer.OnMaintenanceStateChanged）——它覆盖 "加载数据库 /
            // 清除数据库 / 更新项目统计" 三个操作，而不只是解析本身。


            var replicaItemDao = _serviceProvider.Get<IReplicaItemDao>();
            var computedItemStatDao = _serviceProvider.Get<IComputedItemStatDao>();
            var transferStashService = new TransferStashService();
                

            // Load the grim database
            var grimDawnDetector = _serviceProvider.Get<GrimDawnDetector>();
            if (grimDawnDetector.GetGrimLocations().Count == 0) {
                Logger.Warn("Could not find the Grim Dawn install location");
                statusLabel.Text = "Could not find the Grim Dawn install location";

                var timer = new System.Windows.Forms.Timer();
                timer.Tick += TimerTickLookForGrimDawn;
                timer.Interval = 10000;
                timer.Start();
            }

            
            var buddyItemDao = _serviceProvider.Get<IBuddyItemDao>();
            var buddySubscriptionDao = _serviceProvider.Get<IBuddySubscriptionDao>();



            _authService = new AuthService(new AuthenticationProvider(settingsService), playerItemDao);


            _modsDatabaseConfigTab = new ModsDatabaseConfig(
                DatabaseLoadedTrigger,
                playerItemDao,
                _parsingService,
                grimDawnDetector,
                settingsService,
                _helpService,
                databaseItemDao,
                replicaItemDao,
                computedItemStatDao,
                // 线 B（B2 补）：清库/重建统计这类"会动到整个游戏数据库"的操作，
                // 期间必须让浏览器界面停止查询。解析本身由 ParsingService 的事件覆盖，
                // 这里覆盖的是不经过解析的那两个按钮。
                maintenance => {
                    if (maintenance) _webServer?.EnterMaintenance();
                    else _webServer?.ExitMaintenance();
                }
            );

            // 线 B（B5/B6）：它不再是嵌进 `modsPanel` 的子窗口（那样的窗口没有标题栏
            // 也没有关闭按钮），而是一个按需显示的独立窗口。属性在这里一次设好，
            // `ShowMaintenanceWindow()` 只负责显示。
            //
            // ⚠️ 别用 `if (!config.TopLevel)` 判断"是否已被嵌入"：`Form.TopLevel`
            // 默认就是 `true`，只有旧的 `UIHelper.AddAndShow` 会把它设成 `false`。
            _modsDatabaseConfigTab.Text = "数据库 / Mods（维护）";
            _modsDatabaseConfigTab.FormBorderStyle = FormBorderStyle.Sizable;
            _modsDatabaseConfigTab.StartPosition = FormStartPosition.CenterScreen;
            _modsDatabaseConfigTab.ShowIcon = true;
            _modsDatabaseConfigTab.MinimizeBox = true;
            _modsDatabaseConfigTab.MaximizeBox = true;
            _modsDatabaseConfigTab.Size = new Size(920, 620);
            _modsDatabaseConfigTab.MinimumSize = new Size(640, 420);

            var itemTagDao = _serviceProvider.Get<IItemTagDao>();
            var backupService = new BackupService(_authService, playerItemDao, settingsService, _browserCallbacks);
            _charBackupService = new CharacterBackupService(settingsService, _authService);
            _backupServiceWorker = new BackupServiceWorker(backupService, _charBackupService);

            // Live sync for "multiple PCs" users: pushes new items/deletions and applies the same
            // events from the user's other machines instantly. The regular backup above remains the
            // source of truth; this only makes updates propagate faster.
            _webSocketSyncService = new WebSocketSyncService(new AuthenticationProvider(settingsService), settingsService, playerItemDao);
            _webSocketSyncService.Start();

            searchController.OnSearch += (o, args) => backupService.OnSearch();

            
            _itemReplicaService = _serviceProvider.Get<ItemReplicaRequesterService>();
            _itemReplicaService.Start();

            _itemStatPrecomputeService = _serviceProvider.Get<ItemStatPrecomputeService>();
            _itemStatPrecomputeService.Start();


#if !DEBUG
            if (_automaticUpdateChecker.ShouldCheckForUpdates()) {
                _automaticUpdateChecker.CheckForUpdates();
            }
#endif


            _buddyItemsService = new BuddyItemsService(
                buddyItemDao,
                3 * 60 * 1000,
                settingsService,
                _authService,
                buddySubscriptionDao
            );

            // Start the backup task
            _backupBackgroundTask = new BackgroundTask(new FileBackup(playerItemDao, settingsService));

            LocalizationLoader.ApplyLanguage(Controls, RuntimeSettings.Language!);

            _messageProcessors.Add(new GenericErrorHandler());
            _messageProcessors.Add(new InjectionAbortedProcessor(SetInjectionAbortedStatus));


            _transferController = new ItemTransferController(
                _webUiFeedbackHandler,
                _helpService,
                SetFeedback,
                playerItemDao,
                transferStashService,
                settingsService
            );
            new WindowSizeManager(this, settingsService);


            // Suggest translation packs if available
            if (settingsService.GetLocal().LanguageCode.Equals("EN", StringComparison.OrdinalIgnoreCase) && !settingsService.GetLocal().HasSuggestedLanguageChange) {
                if (LocalizationLoader.HasSupportedTranslations(grimDawnDetector.GetGrimLocations())) {
                    Logger.Debug("A new language pack has been detected, informing end user..");
                    new LanguagePackPicker(itemTagDao, playerItemDao, _parsingService, settingsService).Show(grimDawnDetector.GetGrimLocations());

                    settingsService.GetLocal().HasSuggestedLanguageChange = true;
                }
            }



            _csvParsingService = new CsvParsingService(playerItemDao, _userFeedbackService, cacher, transferStashService, replicaItemDao);
            _csvFileMonitor!.OnModified += (_, arg) => {
                var csvEvent = arg as CsvFileMonitor.CsvEvent;
                _csvParsingService.Queue(csvEvent.Filename, csvEvent.Cooldown);
            };

            _itemReplicaParser = new ItemReplicaParser(replicaItemDao, playerItemDao, _browserCallbacks);
            _replicaCsvFileMonitor!.OnModified += (_, arg) => {
                _itemReplicaParser.Enqueue(arg);
            };
            _itemReplicaParser.Start();


            _csvParsingService.OnItemLooted += (_, arg) => {
                var item = arg.Item;

                // Push the freshly looted item to the user's other machines immediately.
                _webSocketSyncService?.SendItems(new List<PlayerItem> { item });

                // 线 B（B2）：**这条**才是"在游戏里捡到东西"的路径
                // （不是 ListviewUpdateTrigger——那个是设置变更时用的）。
                // 浏览器里的界面不归 WinForms 管，得单独通知。
                _webServer?.BroadcastItemsChanged();
            };

            // Push in-game transfers (deletions) live, so the item disappears from the user's other
            // machines before it can be transferred a second time and duplicated.
            _transferController.OnItemsTransferredToGame += (_, arg) => {
                _webSocketSyncService?.SendDeletions(arg.CloudIds);
            };

            _csvFileMonitor.StartMonitoring(GlobalPaths.CsvLocationIngoing, "*.csv");
            _replicaCsvFileMonitor.StartMonitoring(GlobalPaths.CsvReplicaReadLocation, "*.json");
            _csvParsingService.Start();


            var preloadThread= new Thread(_itemReplicaParser.Preload);
            preloadThread.Start();

            // ── 线 B（B1/B4）：HTTP 服务 ────────────────────────────────────────
            //
            // ★ P1（界面解耦）：这一块**原来在 WebView2 初始化回调里**
            //   （`Browser_CoreWebView2InitializationCompleted`）。那样有两个后果：
            //     1. 没有 WebView2 运行时（或它初始化失败）就**没有 HTTP 服务**
            //        ——浏览器界面跟着一起没了；
            //     2. HTTP 服务要等 WebView2 起来才能用（几百毫秒到几秒）。
            //   现在它只依赖本方法里已经装配好的服务，与 WebView2 完全无关。
            //
            // 放在 `_transferController` 创建之后，是因为工厂要取它（见下方闭包）。
            StartWebServer();

            // 注入器原本挂在 `Shown` 上，但主窗口现在**不会显示**（见 SetVisibleCore
            // override），那个事件不会触发。句柄在 Load 时已经创建好，直接启动即可。
            StartInjector();

            Logger.Debug("UI initialization complete");
        }

        /// <summary>
        /// 启动给**系统浏览器**用的 HTTP 服务（Kestrel，`127.0.0.1:3031`）。
        ///
        /// 失败只记日志、不抛出：它是与旧路径并存的另一条通路，
        /// 起不来也不该让整个程序挂掉（B5/B6 之后它才是唯一通路，那时再改成致命错误）。
        /// </summary>
        private void StartWebServer() {
            try {
                var searchController = _serviceProvider.Get<SearchController>();

                _webServer = new Http.WebServer(
                    searchController,
                    _serviceProvider.Get<IItemTagDao>(),
                    _serviceProvider.Get<SettingsService>(),
                    GlobalPaths.StorageFolder,
                    // 延迟取：工厂在每次转移请求时才求值，那时控制器一定已经建好了。
                    () => _transferController,
                    _serviceProvider.Get<MaintenanceService>()
                );
                _webServer.Start();

                // 线 B（B4）：用系统默认浏览器打开新前端。
                // 同一入口也挂在托盘图标的双击上（MinimizeToTrayHandler）。
                Misc.MinimizeToTrayHandler.OpenWebUi();

            }
            catch (Exception ex) {
                Logger.Warn("HTTP 服务启动失败（不影响程序其他功能）：" + ex.Message);
            }
        }


        private void StartInjector() {
            // Start looking for GD processes!
            _registerWindowDelegate = CustomWndProc;
            _window = new RegisterWindow("GDIAWindowClass", _registerWindowDelegate);

            // This prevents a implicit cast to new ProgressChangedEventHandler(func), which would hit the GC and before being used from another thread
            // Same happens when shutting down, fix unknown
            _injectorCallbackDelegate = InjectorCallback;

            bool isWine = WineDetector.IsRunningInWine();
            string? linuxHackPath = isWine ? GlobalPaths.LinuxHack : null;

            string dllname = "ItemAssistantHook_x64.dll";
            _injector = new InjectionHelper(_injectorCallbackDelegate, false, "Grim Dawn", string.Empty, dllname, linuxHackPath);

            // Under Wine, WM_COPYDATA messages don't work, so poll for .msg files instead
            if (isWine) {
                Logger.Info("Wine detected, starting file-based message polling");
                _wineMessageTimer = new System.Windows.Forms.Timer();
                _wineMessageTimer.Interval = 500;
                _wineMessageTimer.Tick += WineMessagePollTick;
                _wineMessageTimer.Start();
            }
        }

        /// <summary>
        /// Poll the LinuxHack folder for .msg files written by the injected DLL.
        /// File format (binary, matching COPYDATASTRUCT layout):
        ///   bytes 0-3:  cbData (int32, message type)
        ///   bytes 4-7:  dwData (int32, data length)
        ///   bytes 8+:   lpData (raw data bytes)
        /// Files older than 30 seconds are deleted without reading.
        /// Files younger than 2 seconds are skipped (may still be written).
        /// </summary>
        private void WineMessagePollTick(object? sender, EventArgs e) {
            try {
                var linuxHackPath = GlobalPaths.LinuxHack;
                if (!Directory.Exists(linuxHackPath)) return;

                foreach (var file in Directory.GetFiles(linuxHackPath, "*.msg")) {
                    try {
                        var fileAge = DateTime.Now - File.GetLastWriteTime(file);

                        // Stale message, just delete
                        if (fileAge.TotalSeconds > 30) {
                            File.Delete(file);
                            continue;
                        }

                        var bytes = File.ReadAllBytes(file);
                        File.Delete(file);

                        if (bytes.Length < 8) {
                            Logger.Warn($"Wine message file too small: {file} ({bytes.Length} bytes)");
                            continue;
                        }

                        int type = BitConverter.ToInt32(bytes, 0);
                        int dataLength = BitConverter.ToInt32(bytes, 4);

                        byte[] data;
                        string stringData = string.Empty;

                        if (dataLength > 0 && bytes.Length >= 8 + dataLength) {
                            data = new byte[dataLength];
                            Array.Copy(bytes, 8, data, 0, dataLength);
                            // Try to read as unicode string
                            try {
                                stringData = System.Text.Encoding.Unicode.GetString(data).TrimEnd('\0');
                            }
                            catch {
                                // Not a valid string, that's fine
                            }
                        }
                        else {
                            data = Array.Empty<byte>();
                        }

                        var msg = new RegisterWindow.DataAndType(type, data, stringData);
                        CustomWndProc(msg);
                    }
                    catch (IOException) {
                        // File may be locked, skip and retry next poll
                    }
                    catch (Exception ex) {
                        Logger.Warn($"Error processing wine message file: {ex.Message}");
                    }
                }
            }
            catch (Exception ex) {
                Logger.Warn($"Error polling wine message files: {ex.Message}");
            }
        }


        #region Tray and Menu

        /// <summary>
        /// Minimize to tray
        /// </summary>
        /// <param name="sender"></param>
        /// <param name="e"></param>
        private void OnMinimizeWindow(object? sender, EventArgs e) {
            _usageStatisticsReporter.ResetLastMinimized();
            _automaticUpdateChecker.ResetLastMinimized();
        }


        private void trayContextMenuStrip_Opening(object sender, CancelEventArgs e) {
            e.Cancel = false;
        }

        /// <summary>
        /// 显示「数据库 / Mods」维护窗口。
        ///
        /// 窗口样式在装配时就设好了（见 `MainWindow_Load`），这里只负责显示。
        /// 它曾经是嵌进 `modsPanel` 的子窗口，旧界面删除后改为独立窗口。
        /// </summary>
        private void ShowMaintenanceWindow() {
            var config = _modsDatabaseConfigTab;
            if (config == null || config.IsDisposed) {
                return;
            }

            config.Show();
            if (config.WindowState == FormWindowState.Minimized) {
                config.WindowState = FormWindowState.Normal;
            }

            config.BringToFront();
            config.Activate();
        }

        private void exitToolStripMenuItem_Click(object sender, EventArgs e) {
            Close();
        }

        #endregion Tray and Menu



        private void openToolStripMenuItem_Click(object sender, EventArgs e) {
            _minimizeToTrayHandler?.notifyIcon_MouseDoubleClick(sender, null);
        }

    } // CLASS
}