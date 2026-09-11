using IAGrim.Database.Interfaces;
using IAGrim.Parsers.GameDataParsing.Service;
using IAGrim.UI.Model;
using IAGrim.UI.Service;
using log4net;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using IAGrim.Parsers.Arz;
using IAGrim.Services;
using IAGrim.Settings;
using IAGrim.Utilities;
using DllInjector;

namespace IAGrim.UI {
    public partial class ModsDatabaseConfig : Form {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(ModsDatabaseConfig));

        private readonly Action _itemViewUpdateTrigger;
        private readonly IPlayerItemDao _playerItemDao;
        private readonly ParsingService _parsingService;
        private readonly DatabaseModSelectionService _databaseModSelectionService;

        private readonly GrimDawnDetector _grimDawnDetector;
        private readonly SettingsService _settingsService;
        private readonly IHelpService _helpService;
        private readonly IDatabaseItemDao _databaseItemDao;
        private readonly IReplicaItemDao _replicaItemDao;
        private readonly IComputedItemStatDao _computedItemStatDao;

        /// <summary>
        /// 进入/退出"维护模式"。
        ///
        /// 这个窗口是**低频维护工具**，但它做的事情（清空并重建整个游戏数据库）
        /// 会让浏览器界面短暂地查到空数据。所以每个会动到整库的按钮都要包一层
        /// `maintenance(true)` … `maintenance(false)`。
        ///
        /// 从 MainWindow 传入的是 `active => _webServer?.EnterMaintenance()` / `ExitMaintenance()`。
        /// 解析（几分钟那个）由 `ParsingService` 自己的事件覆盖，这里管其余按钮。
        /// </summary>
        private readonly Action<bool> _maintenance;

        public ModsDatabaseConfig(
            Action itemViewUpdateTrigger,
            IPlayerItemDao playerItemDao,
            ParsingService parsingService,
            GrimDawnDetector grimDawnDetector,
            SettingsService settingsService,
            IHelpService helpService, IDatabaseItemDao databaseItemDao, IReplicaItemDao replicaItemDao,
            IComputedItemStatDao computedItemStatDao,
            Action<bool> maintenance) {
            InitializeComponent();
            _itemViewUpdateTrigger = itemViewUpdateTrigger;
            _playerItemDao = playerItemDao;
            _parsingService = parsingService;
            _grimDawnDetector = grimDawnDetector;
            _settingsService = settingsService;
            _helpService = helpService;
            _databaseItemDao = databaseItemDao;
            _databaseModSelectionService = new DatabaseModSelectionService();
            _replicaItemDao = replicaItemDao;
            _computedItemStatDao = computedItemStatDao;
            _maintenance = maintenance;
        }

        private void UpdateListView(IEnumerable<string> paths) {
            listViewInstalls.BeginUpdate();
            listViewInstalls.Items.Clear();

            var installs = _databaseModSelectionService.GetGrimDawnInstalls(paths);

            foreach (var grimDawnInstall in installs) {
                listViewInstalls.Items.Add(grimDawnInstall);
            }

            listViewInstalls.EndUpdate();

            if (listViewInstalls.Items.Count > 0) {
                listViewInstalls.Items[0].Selected = true;
            }

            // Show help linklabel?
            helpFindGrimdawnInstall.Visible = listViewInstalls.Items.Count == 0;

            listViewMods.BeginUpdate();
            listViewMods.Items.Clear();

            foreach (var grimDawnInstall in _databaseModSelectionService.GetInstalledMods(paths)) {
                listViewMods.Items.Add(grimDawnInstall);
            }

            listViewMods.EndUpdate();

            if (listViewMods.Items.Count > 0) {
                listViewMods.Items[0].Selected = true;
            }
        }

        private void ModsDatabaseConfig_Load(object sender, EventArgs e) {
            // 这里原本有 `Dock = DockStyle.Fill;`——那是它还被嵌进 modsPanel 时留下的。
            // 现在它是独立的顶层窗口（见 MainWindow.ShowMaintenanceWindow）。
            var paths = _grimDawnDetector.GetGrimLocations();

            // Ensure that we store all known paths.
            foreach (var path in paths) {
                _settingsService.GetLocal().AddGrimDawnLocation(path);
            }

            if (paths.Count == 0) {
                listViewInstalls.Enabled = false;
                buttonForceUpdate.Enabled = false;
            }
            else {
                UpdateListView(paths);
            }

            buttonForceUpdate.Enabled = listViewInstalls.SelectedItems.Count > 0;
        }

        /// <summary>
        /// Sets the "last database update" timestamp to 0 to force an update
        /// Queues a database update, followed by an item stat update.
        /// </summary>
        public void ForceDatabaseUpdate(string? location, string? modLocation) {
            var parsed = false;

            if (!string.IsNullOrEmpty(location) && Directory.Exists(location)) {
                _parsingService.Update(location, modLocation ?? string.Empty);
                _parsingService.Execute();
                parsed = true;

                // The tags were just dropped and rebuilt, in whatever language is currently selected.
                // The language has to be reloaded from them before the item names below are generated,
                // or the names come out ordered for the language that was parsed previously.
                _settingsService.GetLocal().ParsedLanguageCode = _settingsService.GetLocal().LanguageCode;
                RuntimeSettings.InitializeLanguage(_settingsService.GetLocal().LanguageCode, _databaseItemDao.GetTagDictionary());
            }
            else {
                Logger.Warn("Could not find the Grim Dawn install location");
            }

            // Update item stats as well
            var updatingPlayerItemsScreen = new UpdatingPlayerItemsScreen(_playerItemDao);

            updatingPlayerItemsScreen.ShowDialog();
            _itemViewUpdateTrigger?.Invoke();

            // Icons go last. Extraction is memory hungry, so running it alongside the database
            // parse spikes peak memory (out of memory on lower end machines) and slows the parse
            // down. Everything above is modal/blocking, so the parse is complete by this point.
            // A game update can add items whose icons we have never extracted, and the startup
            // icon check is a file-count heuristic that will not notice those.
            if (parsed) {
                ArzParser.QueueIconExtraction(location, modLocation);
            }
        }

        private static ListViewEntry? GetFirst(ListView lv) {
            foreach (ListViewItem lvi in lv.SelectedItems) {
                return lvi.Tag as ListViewEntry;
            }

            return null;
        }

        private void buttonForceUpdate_Click(object sender, EventArgs e) {
            var mod = GetFirst(listViewMods);
            var entry = GetFirst(listViewInstalls);

            // ★ 先确认选好了安装，**再**动数据库。
            //   原来的顺序是先 `Clean()` 再检查，没选中安装时会白白清空整个
            //   游戏数据库然后什么都不做——那正好是"网页突然空了"的一种成因。
            if (entry == null) {
                Logger.Warn("ForceDatabaseUpdate requested with no install selected, aborting.");
                return;
            }

            // 从 Clean() 这一刻起游戏数据库就是空的，直到解析完才恢复。
            // 嵌套没问题：里面的 ParsingService 事件会再进一层（计数式，见 WebServer）。
            _maintenance(true);
            try {
                // Grim Dawn holds its .arc resources open for the whole session, but only with
                // FILE_SHARE_READ -- they remain readable, so there is no need to block parsing here.
                _databaseItemDao.Clean();

                // Icons (base game, expansions and the selected mod) are queued by ForceDatabaseUpdate.
                ForceDatabaseUpdate(entry.Path, mod?.Path);
                _settingsService.GetLocal().CurrentGrimdawnLocation = entry.Path ?? string.Empty;

                // Remembered so an automatic re-parse doesn't silently downgrade a modded database to vanilla.
                _settingsService.GetLocal().CurrentGrimdawnMod = mod?.Path ?? string.Empty;

                // Store the loaded GD path, so we can poll it for updates later.
                //_settingsService.GetLocal().GrimDawnLocation = new List<string> { entry.Path }; // TODO: Wtf is this? Why overwrite any existing?
                _settingsService.GetLocal().GrimDawnLocationLastModified = ParsingService.GetHighestTimestamp(entry.Path ?? string.Empty);
                _settingsService.GetLocal().HasWarnedGrimDawnUpdate = false;

                var isGdParsed = _databaseItemDao.GetRowCount() > 0;
                _settingsService.GetLocal().IsGrimDawnParsed = isGdParsed;
                _helpService.SetIsGrimParsed(isGdParsed);
            }
            finally {
                _maintenance(false);
            }
        }

        private void listView1_SelectedIndexChanged(object sender, EventArgs e) {
            buttonForceUpdate.Enabled = listViewInstalls.SelectedItems.Count > 0;
        }

        /// <summary>
        /// 重算所有已有物品的属性统计。
        ///
        /// 抽出来是因为「更新项目统计」和「清除数据库」都要用它，
        /// 而后者**不能**直接调用前者的 Click 处理器——那会让维护模式多嵌一层，
        /// 内层结束时就把外层也解除了。
        ///
        /// ⚠️ 调用方负责 `_maintenance(true/false)`。
        /// </summary>
        private void UpdateItemStats() {
            var updatingPlayerItemsScreen = new UpdatingPlayerItemsScreen(_playerItemDao);
            updatingPlayerItemsScreen.ShowDialog();

            _replicaItemDao.DeleteAll();
            _computedItemStatDao.DeleteAll();

            _itemViewUpdateTrigger?.Invoke();
        }

        private void buttonUpdateItemStats_Click(object sender, EventArgs e) {
            _maintenance(true);
            try {
                UpdateItemStats();
            }
            finally {
                _maintenance(false);
            }
        }

        private void helpFindGrimdawnInstall_LinkClicked(object sender, LinkLabelLinkClickedEventArgs e) {
            _helpService.ShowHelp(HelpService.HelpType.CannotFindGrimdawn);
        }

        private void buttonClean_Click(object sender, EventArgs e) {
            _maintenance(true);
            try {
                _databaseItemDao.Clean();
                UpdateItemStats();

                MessageBox.Show(RuntimeSettings.Language!.GetTag("iatag_ui_clean_body"),
                    RuntimeSettings.Language.GetTag("iatag_ui_clean_caption"), MessageBoxButtons.OK, MessageBoxIcon.Warning);

                var isGdParsed = _databaseItemDao.GetRowCount() > 0;
                _settingsService.GetLocal().IsGrimDawnParsed = isGdParsed;
                _helpService.SetIsGrimParsed(isGdParsed);
            }
            finally {
                _maintenance(false);
            }
        }

        private void buttonConfigure_Click(object sender, EventArgs e) {
            using (FolderBrowserDialog folderBrowserDialog = new FolderBrowserDialog()) {
                if (folderBrowserDialog.ShowDialog() == DialogResult.OK) {
                    if (File.Exists(Path.Combine(folderBrowserDialog.SelectedPath, "Grim Dawn.exe"))) {
                        _settingsService.GetLocal().AddGrimDawnLocation(folderBrowserDialog.SelectedPath);
                        Logger.Info($"Added {folderBrowserDialog.SelectedPath} to the known Grim Dawn locations");
                        ModsDatabaseConfig_Load(sender, e);
                        // TODO: Kill the task that keeps looking for GD.
                    }
                    else {
                        var text = RuntimeSettings.Language!.GetTag("iatag_ui_db_invalidlocation_body");
                        var title = RuntimeSettings.Language.GetTag("iatag_ui_db_invalidlocation_title");
                        MessageBox.Show(text, title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
            }
        }
    }
}