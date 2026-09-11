using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using IAGrim.Database.Interfaces;
using IAGrim.Parsers.Arz;
using IAGrim.Parsers.GameDataParsing.Service;
using IAGrim.Settings;
using IAGrim.UI.Model;
using IAGrim.UI.Service;
using IAGrim.Utilities;
using log4net;

namespace IAGrim.Services {

    /// <summary>一处 Grim Dawn 安装，或一个 mod。</summary>
    public class GrimDawnLocationDto {
        /// <summary>显示名（安装名 / mod 名）。</summary>
        public required string Name { get; init; }

        /// <summary>磁盘路径。</summary>
        public required string Path { get; init; }
    }

    /// <summary>维护任务的当前状态，供 `/api/maintenance/status` 返回。</summary>
    public class MaintenanceStateDto {
        public required bool Busy { get; init; }
        /// <summary>正在做哪个操作：loadDatabase / cleanDatabase / clearCache</summary>
        public string? Task { get; init; }
        /// <summary>当前阶段名（如 LoadingItems）</summary>
        public string? Phase { get; init; }
        public int Percent { get; init; }
        public int PhaseNumber { get; init; }
        public int PhaseCount { get; init; }
        /// <summary>上一次任务的错误信息，成功则 null</summary>
        public string? Error { get; init; }
    }

    /// <summary>
    /// 「数据库 / Mods」四个维护操作的门面（线 B）。
    ///
    /// ★ 为什么要有这个类：这些逻辑原来散在 `ModsDatabaseConfig`（一个 WinForms 窗口）
    ///   里，和两个模态进度窗口（`ParsingDatabaseProgressView` / `UpdatingPlayerItemsScreen`）
    ///   缠在一起。抽出来之后，HTTP 端点可以直接用，且**不依赖任何 UI**。
    ///
    /// ⚠️ 长任务（加载数据库是分钟级）跑在后台线程：`Start*` 立即返回，
    ///   进度通过 <see cref="OnStateChanged"/> 报出去（HTTP 层订阅后转成 WebSocket）。
    ///   这样页面刷新后还能用 `/api/maintenance/status` 恢复进度。
    /// </summary>
    internal class MaintenanceService {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(MaintenanceService));

        private readonly ParsingService _parsingService;
        private readonly IPlayerItemDao _playerItemDao;
        private readonly IDatabaseItemDao _databaseItemDao;
        private readonly IReplicaItemDao _replicaItemDao;
        private readonly IComputedItemStatDao _computedItemStatDao;
        private readonly GrimDawnDetector _grimDawnDetector;
        private readonly SettingsService _settingsService;
        private readonly DatabaseModSelectionService _modSelection = new DatabaseModSelectionService();

        /// <summary>状态有任何变化就触发。HTTP 层订阅它来推 WebSocket。</summary>
        public event EventHandler? OnStateChanged;

        /// <summary>一个任务完成后触发（用于让网页重查物品列表）。</summary>
        public event EventHandler? OnItemsChanged;

        private readonly object _sync = new object();
        private volatile bool _busy;
        private string? _task;
        private string? _phase;
        private int _percent;
        private int _phaseNumber;
        private int _phaseCount;
        private string? _error;

        public bool IsBusy => _busy;

        public MaintenanceStateDto GetState() {
            lock (_sync) {
                return new MaintenanceStateDto {
                    Busy = _busy,
                    Task = _task,
                    Phase = _phase,
                    Percent = _percent,
                    PhaseNumber = _phaseNumber,
                    PhaseCount = _phaseCount,
                    Error = _error,
                };
            }
        }

        public MaintenanceService(
            ParsingService parsingService,
            IPlayerItemDao playerItemDao,
            IDatabaseItemDao databaseItemDao,
            IReplicaItemDao replicaItemDao,
            IComputedItemStatDao computedItemStatDao,
            GrimDawnDetector grimDawnDetector,
            SettingsService settingsService) {
            _parsingService = parsingService;
            _playerItemDao = playerItemDao;
            _databaseItemDao = databaseItemDao;
            _replicaItemDao = replicaItemDao;
            _computedItemStatDao = computedItemStatDao;
            _grimDawnDetector = grimDawnDetector;
            _settingsService = settingsService;

            // 解析进度 → 统一状态。`OnProgress` 由解析线程触发，可能很频繁，
            // 所以这里不再节流（`OnStateChanged` 的实现方只做一次 WebSocket 广播，很轻）。
            _parsingService.OnProgress += (_, e) => {
                lock (_sync) {
                    _phase = e.Phase;
                    _percent = e.Percent;
                    _phaseNumber = e.PhaseNumber;
                    _phaseCount = e.PhaseCount;
                }

                RaiseStateChanged();
            };
        }

        private void RaiseStateChanged() {
            try {
                OnStateChanged?.Invoke(this, EventArgs.Empty);
            }
            catch (Exception ex) {
                Logger.Warn("广播维护状态时出错：" + ex.Message);
            }
        }

        // ── 查询 ────────────────────────────────────────────────────────

        public List<GrimDawnLocationDto> GetInstalls() {
            return _modSelection.GetGrimDawnInstalls(_grimDawnDetector.GetGrimLocations())
                .Select(ToDto)
                .Where(x => x != null)
                .Select(x => x!)
                .ToList();
        }

        public List<GrimDawnLocationDto> GetMods() {
            return _modSelection.GetInstalledMods(_grimDawnDetector.GetGrimLocations())
                .Select(ToDto)
                .Where(x => x != null)
                .Select(x => x!)
                .ToList();
        }

        /// <summary>
        /// `DatabaseModSelectionService` 返回的是 WinForms 的 `ListViewItem`
        /// （里面塞了个 `ListViewEntry` 当 Tag）。这里转成干净的数据形状，
        /// 免得 HTTP 层与前端见到 UI 类型。
        /// </summary>
        private static GrimDawnLocationDto? ToDto(System.Windows.Forms.ListViewItem item) {
            if (item.Tag is not ListViewEntry entry || string.IsNullOrEmpty(entry.Path)) {
                return null;
            }

            return new GrimDawnLocationDto {
                Name = item.Text,
                Path = entry.Path,
            };
        }

        // ── 配置：手工指定 Grim Dawn 安装目录 ────────────────────────────

        /// <summary>
        /// 把用户粘贴的路径加进"已知 Grim Dawn 安装"。
        ///
        /// ⚠️ 浏览器**不能**打开原生文件夹选择器（安全限制），所以这里收的是一个
        /// 路径字符串，由后端校验。原来的 `FolderBrowserDialog` 就是这么被取代的。
        /// </summary>
        public bool AddInstall(string path, out string? error) {
            error = null;

            if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path)) {
                error = "目录不存在：" + path;
                return false;
            }

            if (!File.Exists(Path.Combine(path, "Grim Dawn.exe"))) {
                error = "这个目录里没有 Grim Dawn.exe，看起来不是游戏安装目录。";
                return false;
            }

            _settingsService.GetLocal().AddGrimDawnLocation(path);
            Logger.Info($"已把 {path} 加入已知的 Grim Dawn 安装位置");
            return true;
        }

        // ── 操作入口（都立即返回，实际工作在后台线程）────────────────────

        /// <summary>加载（重新解析）游戏数据库。分钟级。</summary>
        public bool StartLoadDatabase(string install, string? mod, out string? error) {
            if (string.IsNullOrWhiteSpace(install) || !Directory.Exists(install)) {
                error = "安装目录不存在：" + install;
                return false;
            }

            if (!TryBegin("loadDatabase", out error)) {
                return false;
            }

            RunInBackground(() => DoLoadDatabase(install, mod ?? string.Empty));
            return true;
        }

        /// <summary>清空游戏数据库（不影响玩家物品）。</summary>
        public bool StartCleanDatabase(out string? error) {
            if (!TryBegin("cleanDatabase", out error)) {
                return false;
            }

            RunInBackground(() => {
                _databaseItemDao.Clean();

                // 清库后物品的属性和缓存都没意义了，一并重算（与旧界面行为一致）
                UpdateItemStats();

                var isParsed = _databaseItemDao.GetRowCount() > 0;
                _settingsService.GetLocal().IsGrimDawnParsed = isParsed;
            });

            return true;
        }

        /// <summary>重算所有已有物品的属性统计（旧界面上叫 Clear cache）。</summary>
        public bool StartClearCache(out string? error) {
            if (!TryBegin("clearCache", out error)) {
                return false;
            }

            RunInBackground(UpdateItemStats);
            return true;
        }

        // ── 内部 ────────────────────────────────────────────────────────

        private bool TryBegin(string task, out string? error) {
            error = null;

            lock (_sync) {
                if (_busy) {
                    error = "已有维护任务正在进行，请等它结束。";
                    return false;
                }

                _busy = true;
                _task = task;
                _phase = null;
                _percent = 0;
                _phaseNumber = 0;
                _phaseCount = 0;
                _error = null;
            }

            RaiseStateChanged();
            return true;
        }

        private void RunInBackground(Action work) {
            var thread = new Thread(() => {
                try {
                    work();
                }
                catch (Exception ex) {
                    Logger.Error($"维护任务 {_task} 失败", ex);
                    lock (_sync) {
                        _error = ex.Message;
                    }
                }
                finally {
                    lock (_sync) {
                        _busy = false;
                        _phase = null;
                        _percent = 0;
                    }

                    RaiseStateChanged();
                    OnItemsChanged?.Invoke(this, EventArgs.Empty);
                }
            });

            thread.IsBackground = true;
            thread.Start();
        }

        /// <summary>
        /// 加载数据库的完整流程。
        ///
        /// 这段编排原来在 `ModsDatabaseConfig.ForceDatabaseUpdate` 里，顺序是有讲究的：
        /// 解析 → 重新加载语言 → 重算玩家物品属性 → 排队提取图标。
        /// </summary>
        private void DoLoadDatabase(string install, string mod) {
            Logger.Info($"开始加载游戏数据库：install={install}, mod={mod}");

            // 先把游戏数据库清空——从这一刻起查询会拿到空数据，
            // 所以 HTTP 层必须处于维护模式（由 OnStateChanged 驱动）。
            _databaseItemDao.Clean();

            _parsingService.Update(install, mod);
            _parsingService.Execute();

            // tag 刚被重建，语言得重新加载一次，否则下面生成物品名会用上一次解析的语言。
            _settingsService.GetLocal().ParsedLanguageCode = _settingsService.GetLocal().LanguageCode;
            RuntimeSettings.InitializeLanguage(_settingsService.GetLocal().LanguageCode, _databaseItemDao.GetTagDictionary());

            UpdateItemStats();

            // 图标放最后：提取很吃内存，和解析同时跑会拉高峰值内存，
            // 低配机器上会 OOM。上面都是阻塞的，到这里解析已经结束了。
            ArzParser.QueueIconExtraction(install, string.IsNullOrEmpty(mod) ? null : mod);

            _settingsService.GetLocal().CurrentGrimdawnLocation = install;
            // 记住它，免得自动重新解析时把一个带 mod 的库悄悄降级成原版
            _settingsService.GetLocal().CurrentGrimdawnMod = mod;
            _settingsService.GetLocal().GrimDawnLocationLastModified = ParsingService.GetHighestTimestamp(install);
            _settingsService.GetLocal().HasWarnedGrimDawnUpdate = false;
            _settingsService.GetLocal().IsGrimDawnParsed = _databaseItemDao.GetRowCount() > 0;

            Logger.Info("游戏数据库加载完成");
        }

        /// <summary>
        /// 重算所有玩家物品的属性统计。
        ///
        /// 原来这里是 `UpdatingPlayerItemsScreen.ShowDialog()`（一个模态进度窗口）
        /// 包着 `StatUpdateUIBackgroundWorker`。现在进度直接报给状态。
        /// </summary>
        private void UpdateItemStats() {
            const string phase = "UpdatingItemStats";
            var step = 0;

            void Report(int current, int max) {
                lock (_sync) {
                    _phase = phase;
                    _phaseNumber = 1;
                    _phaseCount = 1;
                    _percent = max > 0 ? Math.Min(current * 100 / max, 100) : 0;
                }

                RaiseStateChanged();
            }

            Logger.Info("Updating player stats");
            var items = _playerItemDao.ListAll();
            Report(0, items.Count);

            _playerItemDao.UpdateAllItemStats(items, _ => {
                step++;
                // 物品可能上万件，不必每个都推一次
                if (step % 25 == 0) {
                    Report(step, items.Count);
                }
            });

            _replicaItemDao.DeleteAll();
            _computedItemStatDao.DeleteAll();

            Report(items.Count, items.Count);
            Logger.Info("Updated item stats");
        }
    }
}
