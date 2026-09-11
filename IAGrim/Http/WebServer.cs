using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using log4net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using IAGrim.Database;
using IAGrim.Database.Dto;
using IAGrim.Database.Interfaces;
using IAGrim.Settings;
using IAGrim.Settings.Dto;
using IAGrim.UI.Controller;
using IAGrim.UI.Misc;
using IAGrim.Utilities;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace IAGrim.Http {

    /// <summary>
    /// REST 层的搜索请求：<see cref="ItemSearchRequest"/> 的全部字段 + 分页参数。
    ///
    /// 之所以继承而不是另定一套：前端提交的 JSON 与 C# 的 DTO **同名同义**，
    /// 将来也不会出现"两套字段"的漂移（见 .docs/03-目标架构.md §4.5）。
    /// </summary>
    public class SearchRequestDto : ItemSearchRequest {
        public int Offset { get; set; }
        public int Limit { get; set; } = 50;
    }

    /// <summary>
    /// 转移请求：把物品从 IA 送回游戏。
    ///
    /// `ids` 是 `PlayerItem.Id`（前端从 `uniqueIdentifier` 的 `PI/{Id}/{...}` 解析出来）。
    /// </summary>
    public class TransferRequestDto {
        public long[] Ids { get; set; } = Array.Empty<long>();
        /// <summary>true = 连同一物品的其它份一起转移</summary>
        public bool TransferAll { get; set; }
    }

    /// <summary>
    /// 设置的增量更新。
    ///
    /// 所有字段**可空**：`null` 表示"这次不改这项"。
    /// 这样前端可以只提交被改动的项，也避免未来的字段增删造成整份覆盖。
    ///
    /// ⚠️ 字段是**刻意收窄**过的（2026-09-12 与使用者逐项确认）：
    /// 暗色模式、最小化到托盘、启动最小化、自动关闭通知、检查更新、
    /// 多电脑共用、在线备份、语言选择都**不在**这里——原因见
    /// .docs/00-当前状态.md 的待办与 .docs/05-实施计划.md 的决策记录。
    /// </summary>
    public class SettingsUpdateDto {
        public bool? HideSkills { get; set; }
        public bool? TransferAnyMod { get; set; }
        public bool? PreferDelayedSearch { get; set; }
        public bool? BackupCustom { get; set; }
        public string? BackupCustomLocation { get; set; }

        /// <summary>物品转移到哪个公共仓库：0 = 倒数第二个，1..6 = 公共仓库 N</summary>
        public int? StashToDepositTo { get; set; }

        /// <summary>从哪个公共仓库取出物品：0 = 最后一个，1..6 = 公共仓库 N</summary>
        public int? StashToLootFrom { get; set; }
    }

    /// <summary>
    /// 线 B（B1）：把现有业务逻辑通过 HTTP 暴露出来，让**系统浏览器**
    /// （而不是 WebView2）也能使用新前端。
    ///
    /// ★ 设计原则（.docs/05-实施计划.md §3）：**与旧路径并存**。
    /// WebView2 仍走虚拟主机 + hostObjects，这里只是新增一条通路——
    /// 出问题把调用处去掉即可退回，不影响程序原有功能。
    ///
    /// 数据侧完全复用 <see cref="SearchController"/>，因此 HTTP 接口返回的
    /// 物品与界面里看到的**由同一套逻辑产出**（含真正的属性翻译）。
    ///
    /// 注意是 `internal`：构造函数要接收 `ItemTransferController`，而它是 internal 的
    /// ——public 类型的方法签名不能暴露更低的可访问性。
    /// </summary>
    internal class WebServer : IDisposable {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(WebServer));

        /// <summary>固定端口；被占用则启动失败并报错（使用者决定，见 .docs/03-目标架构.md §9）</summary>
        public const int Port = 3031;

        /// <summary>
        /// 与 WebView2 那条路径**共用同一套序列化设置**（camelCase + 忽略 null），
        /// 否则同一个 JsonItem 在两条通路上会变成两种形状。
        /// </summary>
        private static readonly JsonSerializerSettings JsonSettings = new() {
            ReferenceLoopHandling = ReferenceLoopHandling.Ignore,
            Culture = System.Globalization.CultureInfo.InvariantCulture,
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
        };

        private readonly SearchController _search;
        private readonly IItemTagDao _itemTagDao;
        private readonly SettingsService _settings;
        private readonly string _storageFolder;
        /// <summary>
        /// 转移控制器。用**工厂**而不是直接注入：它是在 `MainWindow` 稍后才创建的，
        /// 而 HTTP 服务启动得更早，直接注入只会拿到 null。
        /// </summary>
        private readonly Func<ItemTransferController?> _transferController;

        /// <summary>线 B（B2）：向已连接的浏览器广播"发生了什么"。</summary>
        private readonly WebSocketHub _hub = new WebSocketHub();

        /// <summary>
        /// 维护模式深度：正在重新解析游戏数据库（清库 + 解析几分钟）。
        ///
        /// ⚠️ 为什么需要它：`ModsDatabaseConfig.buttonForceUpdate_Click` 第一件事就是
        /// `_databaseItemDao.Clean()`，之后是几分钟的解析。这期间网页如果照常查询，
        /// 拿到的会是**空库**或半成品——使用者会以为自己的物品丢了。
        ///
        /// ★ 用**计数**而不是布尔：维护期会嵌套——`buttonForceUpdate_Click` 自己包一层，
        /// 里面的 `ParsingService.OnParseStarted` 又包一层。用布尔的话，内层先结束就会
        /// 把外层也解冻，而那时它还没干完活。
        /// </summary>
        private int _maintenanceDepth;

        /// <summary>维护期间给前端显示的说明。</summary>
        private string _maintenanceMessage = "正在更新游戏数据库…";

        private WebApplication? _app;

        public WebServer(
            SearchController search,
            IItemTagDao itemTagDao,
            SettingsService settings,
            string storageFolder,
            Func<ItemTransferController?> transferController) {
            _search = search;
            _itemTagDao = itemTagDao;
            _settings = settings;
            _storageFolder = storageFolder;
            _transferController = transferController;
        }

        private static IResult Json(object payload) {
            return Results.Text(
                JsonConvert.SerializeObject(payload, JsonSettings),
                "application/json",
                Encoding.UTF8);
        }

        public void Start() {
            var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions {
                ContentRootPath = AppContext.BaseDirectory,
            });

            // 让 log4net 管日志；Kestrel 自己的控制台输出会把日志搅乱。
            builder.Logging.ClearProviders();
            builder.WebHost.UseUrls($"http://127.0.0.1:{Port}");

            _app = builder.Build();

            // 线 B（B2）：WebSocket 用于把"数据库变了"这类事件推给浏览器。
            // KeepAliveInterval 是必须的：浏览器长时间开着是常态，没有 ping
            // 的话中间的连接会被悄悄回收，而前端还以为自己连着。
            _app.UseWebSockets(new WebSocketOptions {
                KeepAliveInterval = TimeSpan.FromSeconds(30),
            });

            // 静态文件：新前端的构建产物就在 storage 目录——
            // 与 WebView2 虚拟主机映射的是**同一个目录**，所以两者看到的前端一致。
            var files = new PhysicalFileProvider(_storageFolder);
            _app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
            _app.UseStaticFiles(new StaticFileOptions { FileProvider = files });

            MapApi(_app);

            // 同步等待启动完成：这样"端口被占用"这类错误会在这里抛出，
            // 调用方才能记录下来（否则会变成一个静默失败的后台任务）。
            _app.StartAsync().GetAwaiter().GetResult();
            Logger.Info($"HTTP 服务已启动：http://127.0.0.1:{Port}（静态文件：{_storageFolder}）");
        }

        private void MapApi(WebApplication app) {
            // ── 线 B（B2）：WebSocket ───────────────────────────────────────────
            //
            // 只做**服务端 → 客户端**的单向推送：前端自己要用什么数据仍然走 REST。
            // 所以这里的接收循环只为感知断开（前端关页面/刷新），收到的内容一律忽略。
            app.Map("/ws", async (HttpContext ctx) => {
                if (!ctx.WebSockets.IsWebSocketRequest) {
                    ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
                    await ctx.Response.WriteAsync("此端点只接受 WebSocket 连接");
                    return;
                }

                var socket = await ctx.WebSockets.AcceptWebSocketAsync();
                var id = _hub.Add(socket);

                var buffer = new byte[1024];
                try {
                    while (socket.State == WebSocketState.Open) {
                        var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), ctx.RequestAborted);
                        if (result.MessageType == WebSocketMessageType.Close) {
                            break;
                        }
                    }
                }
                catch (OperationCanceledException) {
                    // 程序退出或前端直接关掉页面，都走这里，属正常。
                }
                catch (WebSocketException ex) {
                    Logger.Debug($"WebSocket 连接异常结束：{ex.Message}");
                }
                finally {
                    _hub.Remove(id);
                }
            });

            app.MapGet("/api/health", () => Json(new {
                ok = true,
                port = Port,
                // C# 后端是**真后端**（不是 tools/devapi 那个只读原型）
                readOnly = false,
                // 前端首次加载时 WS 还没连上，靠这个字段就能知道该不该显示遮罩。
                maintenance = IsMaintenance,
                maintenanceMessage = IsMaintenance ? _maintenanceMessage : null,
            }));

            // GET /api/items?offset=&limit= —— 对应原 RequestMoreItems()
            app.MapGet("/api/items", (int? offset, int? limit) => {
                if (MaintenanceGuard() is IResult guard) {
                    return guard;
                }

                var off = offset ?? 0;
                var lim = limit ?? 50;
                var items = _search.QueryItems(new ItemSearchRequest(), off, lim, out int total, out bool truncated);
                return Json(new { total, offset = off, limit = lim, truncated, items });
            });

            // POST /api/search —— 请求体结构见 .docs/03-目标架构.md §4.5
            app.MapPost("/api/search", (SearchRequestDto dto) => {
                if (MaintenanceGuard() is IResult guard) {
                    return guard;
                }

                var items = _search.QueryItems(dto, dto.Offset, dto.Limit, out int total, out bool truncated);
                return Json(new { total, offset = dto.Offset, limit = dto.Limit, truncated, items });
            });

            // POST /api/items/transfer —— 把物品转移回游戏（**写操作**）
            //
            // 复用 ItemTransferController，它做两件事：
            //   ① 把物品序列化成 CSV 放进 `CsvLocationOutgoing`（**不是直接写存档**），
            //      由注入游戏的 hook 读取后放进共享仓库；
            //   ② 把 StackCount 置 0，随后 `Update` 会删掉该记录。
            //
            // ⚠️ 控制器在 MainWindow 里稍后才创建，所以用工厂延迟取（见字段注释）。
            app.MapPost("/api/items/transfer", (TransferRequestDto dto) => {
                // 维护期间游戏数据库正在重建，物品记录也在被重写，不能转移。
                if (MaintenanceGuard() is IResult guard) {
                    return guard;
                }

                var controller = _transferController();
                if (controller == null) {
                    return Json(new { success = false, error = "转移功能尚未就绪（程序可能仍在启动）" });
                }

                if (dto.Ids.Length == 0) {
                    return Json(new { success = false, error = "没有指定要转移的物品" });
                }

                // TransferAnyMod 会弹出 `StashPicker` 模态对话框让人选 mod —— 那必须在 UI 线程上。
                // HTTP 请求跑在线程池线程，弹窗会直接抛异常，所以这里明确拒绝而不是让它半路炸掉。
                if (_settings.GetPersistent().TransferAnyMod) {
                    return Json(new {
                        success = false,
                        error = "已开启「允许转移到任意 mod」，该功能需要弹窗选择目标 mod，暂不支持从浏览器转移。请在设置中关闭后重试。",
                    });
                }

                var transferred = 0;
                var failed = new List<long>();

                foreach (var id in dto.Ids) {
                    // identifier 的格式由 StashTransferEventArgs 决定：
                    //   ["PI", <PlayerItemId>, "", "", "", IsHardcore]
                    // 长度必须**恰好 6**，且第 0 位是 "PI" 才会被识别为"按 id 精确转移"。
                    var identifier = new object[] {
                        "PI", id, string.Empty, string.Empty, string.Empty, false,
                    };
                    var args = new StashTransferEventArgs(identifier, dto.TransferAll);

                    controller.TransferItem(args);

                    if (args.IsSuccessful) {
                        transferred += args.NumTransferred;
                    }
                    else {
                        failed.Add(id);
                    }
                }

                Logger.Info(
                    $"HTTP 转移：请求 {dto.Ids.Length} 件，成功 {transferred} 件，失败 {failed.Count} 件");

                if (transferred > 0) {
                    // 发起请求的那个页面自己会刷新列表，但**其它**打开的标签页也得跟着变。
                    BroadcastItemsChanged();
                }

                return Json(new {
                    success = failed.Count == 0,
                    numTransferred = transferred,
                    failed,
                });
            });

            // GET /api/settings —— 设置（只暴露用户可改的那些）
            //
            // 不把 LocalSettings/PersistentSettings 整个序列化出去：那里面有窗口位置、
            // 云 token、解析状态等一堆内部字段，既不该给前端，序列化也会很啰嗦。
            app.MapGet("/api/settings", () => {
                var local = _settings.GetLocal();
                var persistent = _settings.GetPersistent();

                return Json(new {
                    hideSkills = persistent.HideSkills,
                    transferAnyMod = persistent.TransferAnyMod,
                    preferDelayedSearch = local.PreferDelayedSearch,
                    backupCustom = local.BackupCustom,
                    backupCustomLocation = local.BackupCustomLocation,
                    stashToDepositTo = local.StashToDepositTo,
                    stashToLootFrom = local.StashToLootFrom,
                });
            });

            // POST /api/settings —— 增量更新。
            //
            // 设属性会触发各自的 OnMutate 事件，SettingsService 据此自动落盘
            // （见 SettingsService 构造函数里的 `OnMutate += ... Persist()`），
            // 所以这里**不需要**显式保存。
            app.MapPost("/api/settings", (SettingsUpdateDto dto) => {
                var local = _settings.GetLocal();
                var persistent = _settings.GetPersistent();

                // `hideSkills` 会改变物品详情里渲染出来的内容（技能说明整段被隐藏），
                // 所以它一变，所有页面都得重查列表。其余几项只影响"下一次操作"
                // （备份路径、延迟、仓库序号），改完不需要刷新列表。
                var listAffectingChange = dto.HideSkills.HasValue && dto.HideSkills.Value != persistent.HideSkills;

                if (dto.HideSkills.HasValue) persistent.HideSkills = dto.HideSkills.Value;
                if (dto.TransferAnyMod.HasValue) persistent.TransferAnyMod = dto.TransferAnyMod.Value;
                if (dto.PreferDelayedSearch.HasValue) local.PreferDelayedSearch = dto.PreferDelayedSearch.Value;
                if (dto.BackupCustom.HasValue) local.BackupCustom = dto.BackupCustom.Value;
                if (dto.BackupCustomLocation != null) local.BackupCustomLocation = dto.BackupCustomLocation;
                if (dto.StashToDepositTo.HasValue) local.StashToDepositTo = dto.StashToDepositTo.Value;
                if (dto.StashToLootFrom.HasValue) local.StashToLootFrom = dto.StashToLootFrom.Value;

                Logger.Info("设置已通过 HTTP 更新");

                if (listAffectingChange) {
                    BroadcastItemsChanged();
                }

                return Json(new { success = true });
            });

            // ── 动作（设置页第二栏）─────────────────────────────────────────

            // POST /api/settings/reset —— 重置设置。
            //
            // ★ 使用者的要求：重置前**先备份一份「设置」**。
            //   备份的是设置文件（settings.json），**不是物品数据**——两者完全不同。
            //
            // ★ 而且**不重启程序**：只把界面上能改的那几项恢复为初始值。
            //   热重置即可，浏览器里的界面不会断线，前端拿到新值立刻刷新。
            app.MapPost("/api/settings/reset", () => {
                var settingsFile = GlobalPaths.SettingsFile;
                string? backupPath = null;

                if (File.Exists(settingsFile)) {
                    var backupDir = Path.Combine(GlobalPaths.CoreFolder, "settings-backups");
                    Directory.CreateDirectory(backupDir);
                    backupPath = Path.Combine(backupDir, $"settings-{DateTime.Now:yyyyMMdd-HHmmss}.json");
                    File.Copy(settingsFile, backupPath, overwrite: true);
                    Logger.Info($"重置设置前已备份到 {backupPath}");
                }

                var hideSkillsBefore = _settings.GetPersistent().HideSkills;

                _settings.ResetVisibleSettings();

                // 重置也可能把 `hideSkills` 改回初始值（初始是 true，见 PersistentSettings），
                // 那同样会改变物品详情的渲染内容，得让页面重查。
                if (hideSkillsBefore != _settings.GetPersistent().HideSkills) {
                    BroadcastItemsChanged();
                }

                // 把重置后的值原样返回，前端据此立即刷新界面——不用再发一次 GET。
                var local = _settings.GetLocal();
                var persistent = _settings.GetPersistent();

                return Json(new {
                    success = true,
                    backup = backupPath,
                    settings = new {
                        hideSkills = persistent.HideSkills,
                        transferAnyMod = persistent.TransferAnyMod,
                        preferDelayedSearch = local.PreferDelayedSearch,
                        backupCustom = local.BackupCustom,
                        backupCustomLocation = local.BackupCustomLocation,
                        stashToDepositTo = local.StashToDepositTo,
                        stashToLootFrom = local.StashToLootFrom,
                    },
                });
            });

            // GET /api/settings/export —— 导出设置文件（浏览器直接下载）
            app.MapGet("/api/settings/export", () => {
                var settingsFile = GlobalPaths.SettingsFile;
                return File.Exists(settingsFile)
                    ? Results.File(settingsFile, "application/json", "iagd-settings.json")
                    : Results.NotFound();
            });

            // POST /api/settings/import —— 导入设置（用请求体传 JSON，避免 multipart）
            app.MapPost("/api/settings/import", async (HttpContext ctx) => {
                string json;
                using (var reader = new StreamReader(ctx.Request.Body)) {
                    json = await reader.ReadToEndAsync();
                }

                // 先确认它是能解析的设置文件，别把坏数据写进去
                try {
                    JsonConvert.DeserializeObject<SettingsTemplate>(json);
                }
                catch (Exception ex) {
                    return Json(new { success = false, error = "不是合法的设置文件：" + ex.Message });
                }

                var settingsFile = GlobalPaths.SettingsFile;
                if (File.Exists(settingsFile)) {
                    var backupDir = Path.Combine(GlobalPaths.CoreFolder, "settings-backups");
                    Directory.CreateDirectory(backupDir);
                    var backupPath = Path.Combine(backupDir, $"settings-{DateTime.Now:yyyyMMdd-HHmmss}.json");
                    File.Copy(settingsFile, backupPath, overwrite: true);
                    Logger.Info($"导入设置前已备份到 {backupPath}");
                }

                File.WriteAllText(settingsFile, json);
                Logger.Info("设置已导入，准备重启以生效");

                Task.Run(async () => {
                    await Task.Delay(600);
                    StartupService.Restart();
                });

                return Json(new { success = true });
            });

            // POST /api/open/{target} —— 在资源管理器里打开目录
            //   backups = 备份目录；logs = 数据目录（log.txt 在那里）
            app.MapPost("/api/open/{target}", (string target) => {
                var path = target switch {
                    "backups" => GlobalPaths.BackupLocation,
                    "logs" => GlobalPaths.CoreFolder,
                    _ => null,
                };

                if (path == null || !Directory.Exists(path)) {
                    return Json(new { success = false, error = "目录不存在：" + target });
                }

                // 与旧界面一致：shell 打开目录
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo {
                    FileName = "file://" + path,
                    UseShellExecute = true,
                });

                return Json(new { success = true, path });
            });
            // 合并两个来源：游戏文本（数据库）+ IA 自己的界面文案（语言对象）。
            // GET /api/i18n —— 对应原 GetTranslationStrings()
            app.MapGet("/api/i18n", () => {
                var map = new Dictionary<string, string>();

                foreach (var tag in _itemTagDao.ListAll()) {
                    if (!string.IsNullOrEmpty(tag.Tag) && !string.IsNullOrEmpty(tag.Name)) {
                        map[tag.Tag!] = tag.Name!;
                    }
                }

                var language = RuntimeSettings.Language;
                if (language != null) {
                    // IA 的界面文案（iatag_*）覆盖同名的游戏文本
                    foreach (var pair in language.ExportTags()) {
                        map[pair.Key] = pair.Value;
                    }
                }

                return Json(map);
            });

            // GET /img/{icon} —— 物品图标。
            //
            // ★ 两种 icon 值的形状不同，这里都要接受：
            //   - **C# 后端**（`PlayerHeldItem.Bitmap`）：`d014_focus.tex.png`（已带 .png、无路径）
            //   - **devapi 原型**（数据库的 bitmap 列）：`items/gearhead/bitmaps/c216_head.tex`
            // 所以取文件名后，只在**还没有** .png 后缀时才补。
            app.MapGet("/img/{**icon}", (string icon) => {
                var name = Path.GetFileName(icon);
                if (string.IsNullOrEmpty(name)) {
                    return Results.NotFound();
                }

                var file = name.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                    ? Path.Combine(_storageFolder, name)
                    : Path.Combine(_storageFolder, name + ".png");

                return File.Exists(file)
                    ? Results.File(file, "image/png")
                    : Results.NotFound();
            });
        }

        /// <summary>
        /// 告诉所有已连接的浏览器：物品数据库变了，去重新查询。
        ///
        /// 只发信号不带数据——新前端自己知道当前在看什么（搜索词、分页），
        /// 由它自己决定重查什么。这也顺带解决了"推送整份列表"的浪费。
        /// </summary>
        public void BroadcastItemsChanged() {
            _hub.Broadcast(new { type = "itemsChanged" });
        }

        /// <summary>是否处于维护模式（HTTP 查询会被拒）。读多写少，用 Volatile 读即可。</summary>
        public bool IsMaintenance => Volatile.Read(ref _maintenanceDepth) > 0;

        /// <summary>
        /// 进入维护模式（可嵌套）。最外层进入时才广播。
        /// </summary>
        public void EnterMaintenance(string? message = null) {
            if (!string.IsNullOrEmpty(message)) {
                _maintenanceMessage = message;
            }

            if (Interlocked.Increment(ref _maintenanceDepth) != 1) {
                return;
            }

            Logger.Info("进入维护模式：解析游戏数据库期间，浏览器界面暂停查询");
            _hub.Broadcast(new {
                type = "maintenance",
                active = true,
                message = _maintenanceMessage,
            });
        }

        /// <summary>
        /// 退出维护模式。最外层退出时才广播，并让页面重查一次列表
        /// （数据库整个换过了）。
        /// </summary>
        public void ExitMaintenance() {
            var depth = Interlocked.Decrement(ref _maintenanceDepth);

            if (depth > 0) {
                return;
            }

            if (depth < 0) {
                // Exit 多于 Enter 了。夹回 0，免得计数越跑越负、界面永久卡在可查询状态。
                Interlocked.Exchange(ref _maintenanceDepth, 0);
                Logger.Warn("维护模式计数被减到负数（Exit 多于 Enter），已归零");
                return;
            }

            Logger.Info("退出维护模式，浏览器界面恢复");
            _hub.Broadcast(new {
                type = "maintenance",
                active = false,
                message = _maintenanceMessage,
            });

            BroadcastItemsChanged();
        }

        /// <summary>
        /// 维护期间拒绝查询类请求。
        ///
        /// 返回 503 而不是让 SQL 在半成品数据库上跑：那既可能报错，
        /// 更糟的是**可能成功**并返回一个空列表，让人以为物品没了。
        /// </summary>
        private IResult? MaintenanceGuard() {
            if (!IsMaintenance) {
                return null;
            }

            return Results.Json(new {
                error = _maintenanceMessage,
                maintenance = true,
            }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        public void Dispose() {
            try {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                _app?.StopAsync(cts.Token).Wait(TimeSpan.FromSeconds(3));
            }
            catch (Exception ex) {
                Logger.Warn("停止 HTTP 服务时出错：" + ex.Message);
            }

            _app = null;
            _hub.Dispose();
        }
    }
}
