using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows.Forms;
using EvilsoftCommons;
using EvilsoftCommons.Exceptions;
using IAGrim.Database.Interfaces;
using IAGrim.Parsers.GameDataParsing.Model;
using IAGrim.Utilities;
using log4net;

namespace IAGrim.Parsers.GameDataParsing.Service {

    /// <summary>
    /// 解析进度（线 B）。原来的模态进度窗口有 11 根进度条（每阶段一根），
    /// 这里改成一个"当前阶段 + 该阶段百分比 + 第几步"的扁平结构——
    /// 网页上显示成一件事正在做，比同时刷 11 根条清楚。
    /// </summary>
    public class ParseProgressEventArgs : EventArgs {
        /// <summary>阶段名，取值见 <c>ParsingService.Phases</c>（如 LoadingItems）。</summary>
        public required string Phase { get; init; }

        /// <summary>当前阶段的完成度 0-100。</summary>
        public required int Percent { get; init; }

        /// <summary>当前是第几个阶段，从 1 开始。</summary>
        public required int PhaseNumber { get; init; }

        /// <summary>总阶段数，用于"第 3 / 11 步"。</summary>
        public required int PhaseCount { get; init; }
    }

    public class ParsingService {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(ParsingService));
        private string _grimdawnLocation;
        private string? _modLocation;

        private readonly IItemTagDao _itemTagDao;
        private readonly IDatabaseItemDao _databaseItemDao;
        private readonly IDatabaseItemStatDao _databaseItemStatDao;
        private readonly IItemSkillDao _itemSkillDao;
        private readonly string _languageCode;
        public event EventHandler? OnParseComplete;

        /// <summary>
        /// 解析过程中的进度（线 B）：替代原来的 `ParsingDatabaseProgressView` 模态窗口。
        ///
        /// ★ 之所以容易做：真正的进度模型 `ProgressTracker` **本来与 UI 无关**
        ///   （只有 Progress / MaxValue / OnProgressChanged），焊死在 WinForms 上的
        ///   只是 `WinformsProgressBar` 那层 20 行适配器。这里换成把事件直接报出去。
        /// </summary>
        public event EventHandler<ParseProgressEventArgs>? OnProgress;

        /// <summary>解析失败，附一句给使用者看的话（原来是弹 MessageBox）。</summary>
        public event EventHandler<string>? OnParseFailed;

        /// <summary>解析有多少个阶段。前端拿它显示"第几步 / 共几步"。</summary>
        public static int PhaseCount => Phases.Length;

        /// <summary>阶段顺序即执行顺序。</summary>
        private static readonly string[] Phases = {
            "LoadingTags",
            "SavingTags",
            "LoadingItems",
            "MappingItemNames",
            "MappingPetStats",
            "SavingItems",
            "IndexingItems",
            "GeneratingSpecialStats",
            "SavingSpecialStats",
            "GeneratingSkills",
            "SkillCorrectnessCheck",
        };

        private int _phaseIndex;

        /// <summary>
        /// 开一个阶段的进度追踪器，并把它的变化报给 <see cref="OnProgress"/>。
        ///
        /// 参数就是 <see cref="Phases"/> 里的阶段名（顺序必须一致）。
        /// </summary>
        private ProgressTracker Track(string phase) {
            var number = ++_phaseIndex;
            var tracker = new ProgressTracker();

            void Report() {
                OnProgress?.Invoke(this, new ParseProgressEventArgs {
                    Phase = phase,
                    Percent = tracker.Progress,
                    PhaseNumber = number,
                    PhaseCount = Phases.Length,
                });
            }

            // MaxValue 变化时也报一次：这样前端能立刻看到"进入了一个新阶段"，
            // 而不是等第一个 Increment 才切换标题。
            tracker.OnMaxValueChanged += (_, _) => Report();
            tracker.OnProgressChanged += (_, _) => Report();

            return tracker;
        }

        /// <summary>
        /// 解析**开始**了。
        ///
        /// 线 B（B2 补）：解析期间游戏数据库是被清空/重建的，浏览器界面必须
        /// 停止查询（见 `WebServer.EnterMaintenance`）。`OnParseComplete` 已经存在，
        /// 这里补上与之配对的开头——只有结尾没有开头，调用方就没法知道该冻结。
        /// </summary>
        public event EventHandler? OnParseStarted;


        public ParsingService(
            IItemTagDao itemTagDao,
            string grimdawnLocation,
            IDatabaseItemDao databaseItemDao,
            IDatabaseItemStatDao databaseItemStatDao,
            IItemSkillDao itemSkillDao,
            string languageCode
        ) {
            _itemTagDao = itemTagDao;
            _grimdawnLocation = grimdawnLocation;
            _databaseItemDao = databaseItemDao;
            _databaseItemStatDao = databaseItemStatDao;
            _itemSkillDao = itemSkillDao;
            _languageCode = languageCode;
        }

        public static long GetHighestTimestamp(string install) {
            try {
                List<string> arzFiles = new List<string> {
                    GrimFolderUtility.FindArzFile(install)
                };

                foreach (string path in GrimFolderUtility.GetGrimExpansionFolders(install)) {
                    string expansionItems = GrimFolderUtility.FindArzFile(path);

                    if (!string.IsNullOrEmpty(expansionItems)) {
                        arzFiles.Add(GrimFolderUtility.FindArzFile(expansionItems));
                    }
                }

                return arzFiles
                    .Select(File.GetLastWriteTimeUtc)
                    .Select(ts => ts.ToTimestamp())
                    .Max();
            }
            catch (Exception e) {
                Logger.Warn("Error fetching timestamp, defaulting to unchanged", e);
                return 0;
            }
        }

        public void Update(string install, string mod) {
            _grimdawnLocation = install;
            _modLocation = mod;
        }

        public void Execute() {
            // 尽早在最前面：调用方（ModsDatabaseConfig / StartupService）都是在
            // 调用本方法**之前**就 Clean() 掉了游戏数据库，所以从这一刻起
            // 浏览器界面就不该再查了。
            OnParseStarted?.Invoke(this, EventArgs.Empty);

            var parser = new ArzParsingWrapper();
            _phaseIndex = 0;

            string arcFileName = $"text_{_languageCode.ToLowerInvariant()}.arc";

            // Always load English first as fallback, then overlay selected language
            List<string> tagfiles = new List<string>();

            // English tags first (fallback)
            string vanillaEnTags = GrimFolderUtility.FindArcFile(_grimdawnLocation, "text_en.arc");
            if (!string.IsNullOrEmpty(vanillaEnTags)) {
                tagfiles.Add(vanillaEnTags);
            }

            foreach (string path in GrimFolderUtility.GetGrimExpansionFolders(_grimdawnLocation)) {
                string expansionEnTags = GrimFolderUtility.FindArcFile(path, "text_en.arc");
                if (!string.IsNullOrEmpty(expansionEnTags)) {
                    tagfiles.Add(expansionEnTags);
                }
            }

            string modEnTags = string.IsNullOrEmpty(_modLocation) ? "" : GrimFolderUtility.FindArcFile(_modLocation, "text_en.arc");
            if (!string.IsNullOrEmpty(modEnTags)) {
                tagfiles.Add(modEnTags);
            }

            // Selected language overlay (if not English)
            if (!_languageCode.Equals("EN", StringComparison.OrdinalIgnoreCase)) {
                string vanillaLangTags = GrimFolderUtility.FindArcFile(_grimdawnLocation, arcFileName);
                if (!string.IsNullOrEmpty(vanillaLangTags)) {
                    tagfiles.Add(vanillaLangTags);
                }

                foreach (string path in GrimFolderUtility.GetGrimExpansionFolders(_grimdawnLocation)) {
                    string expansionLangTags = GrimFolderUtility.FindArcFile(path, arcFileName);
                    if (!string.IsNullOrEmpty(expansionLangTags)) {
                        tagfiles.Add(expansionLangTags);
                    }
                }

                string modLangTags = string.IsNullOrEmpty(_modLocation) ? "" : GrimFolderUtility.FindArcFile(_modLocation, arcFileName);
                if (!string.IsNullOrEmpty(modLangTags)) {
                    tagfiles.Add(modLangTags);
                }
            }




            List<string> arzFiles = new List<string> {
                GrimFolderUtility.FindArzFile(_grimdawnLocation)
            };

            foreach (string path in GrimFolderUtility.GetGrimExpansionFolders(_grimdawnLocation)) {
                string expansionItems = GrimFolderUtility.FindArzFile(path);

                if (!string.IsNullOrEmpty(expansionItems)) {
                    arzFiles.Add(GrimFolderUtility.FindArzFile(expansionItems));
                }
            }

            if (!string.IsNullOrEmpty(_modLocation)) {
                arzFiles.Add(GrimFolderUtility.FindArzFile(_modLocation));
            }


            // 后台线程跑解析。**不显示任何进度窗口**——进度通过 OnProgress 报给
            // WebSocket，由网页显示（线 B，见 .docs/10-界面解耦.md）。
            Thread t = new Thread(() => {
                ExceptionReporter.EnableLogUnhandledOnThread();

                try {
                    ExecuteParse(parser, tagfiles, arzFiles);
                }
                catch (IOException ex) {
                    // Grim Dawn itself does not block us from reading its files, but Steam mid-update (or antivirus) can
                    Logger.Warn($"Unable to read the Grim Dawn game files (HResult 0x{ex.HResult:X8}): {ex.Message}", ex);
                    OnParseFailed?.Invoke(this, GameFilesInUseMessage());
                }
                catch (Exception ex) {
                    // 原来没有这个兜底：异常会在解析线程里逃逸，调用方永远收不到
                    // OnParseComplete（因为 ShowDialog 靠窗口关闭来结束）。
                    Logger.Error("解析游戏数据时发生未预期的错误", ex);
                    OnParseFailed?.Invoke(this, "解析游戏数据时发生错误：" + ex.Message);
                }
            });

            t.Start();

            // 等解析线程结束，但**保持消息循环活着**，否则从 UI 线程调用时整个程序假死
            // 几分钟（托盘菜单都点不动）。从后台线程调用（HTTP 端点）时没有消息循环，
            // 直接等即可。
            if (Application.MessageLoop) {
                while (!t.Join(50)) {
                    Application.DoEvents();
                }
            }
            else {
                t.Join();
            }

            OnParseComplete?.Invoke(this, EventArgs.Empty);
        }

        private static string GameFilesInUseMessage() {
            var message = RuntimeSettings.Language?.GetTag("iatag_ui_gamefiles_in_use");
            if (string.IsNullOrEmpty(message)) {
                message = "无法读取 Grim Dawn 的游戏文件，它们正被其它程序占用。\n"
                          + "如果 Steam 正在更新或校验 Grim Dawn，请等它完成后再试。";
            }

            return message;
        }

        private void ExecuteParse(
            ArzParsingWrapper parser,
            List<string> tagfiles,
            List<string> arzFiles
        ) {
            parser.LoadTags(tagfiles, Track("LoadingTags"));
            _itemTagDao.Save(parser.Tags, Track("SavingTags"));
            parser.LoadItems(arzFiles, Track("LoadingItems"));
            parser.MapItemNames(Track("MappingItemNames"));
            parser.RenamePetStats(Track("MappingPetStats"));
            _databaseItemDao.Save(parser.Items ?? [], Track("SavingItems"));
            _databaseItemDao.CreateItemIndexes(Track("IndexingItems"));

            // TODO: This depends on the DB item name.. which is in english, not localized
            {
                var records = parser.GenerateSpecialRecords(Track("GeneratingSpecialStats"));
                _databaseItemStatDao.Save(records, Track("SavingSpecialStats"));
            };


            parser.ParseComplexItems(_itemSkillDao, Track("GeneratingSkills"));
            {
                var tracker = Track("SkillCorrectnessCheck");
                tracker.MaxValue = 1;
                _itemSkillDao.EnsureCorrectSkillRecords();
                tracker.MaxProgress();
            };
        }
    }
}