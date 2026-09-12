using System;
using System.IO;
using IAGrim.Utilities;
using log4net;

namespace IAGrim.Services {

    /// <summary>
    /// 把 IA 自带的前端产物同步到 <see cref="GlobalPaths.StorageFolder"/>。
    ///
    /// ★ 为什么需要它：**上游 IA 会覆盖同一个 storage 目录**。
    ///   `C:\Program Files\IAGD\IAGrim.exe`（原版）与我们的构建共用同一个用户
    ///   数据目录（`%LOCALAPPDATA%\EvilSoft\IAGD\`），而原版启动时会把**它自带的
    ///   旧前端**解压进去。于是"打开一次原版，浏览器界面就变回旧样式"
    ///   （2026-09-12 实测踩到）。
    ///
    ///   所以每次启动都检查一次：自带的前端与 storage 里的不一致就重新铺一遍。
    ///   这不能阻止原版覆盖，但能保证**我们的程序一起来就修好**。
    ///
    /// ⚠️ 只碰前端文件（`index.html` 与 `assets/`），**绝不碰物品图标**
    ///   （`storage/*.tex.png`，4573 个）与 `static/`（UI 图标）。
    /// </summary>
    internal static class FrontendDeployer {
        private static readonly ILog Logger = LogManager.GetLogger(typeof(FrontendDeployer));

        /// <summary>自带前端在程序目录下的位置（由 csproj 从 WebUI-next/build 拷来）。</summary>
        private static string SourceFolder => Path.Combine(AppContext.BaseDirectory, "webui");

        public static void EnsureDeployed() {
            try {
                var source = SourceFolder;
                var sourceIndex = Path.Combine(source, "index.html");

                if (!File.Exists(sourceIndex)) {
                    Logger.Debug($"没有自带的前端产物（{source}），跳过同步");
                    return;
                }

                var target = GlobalPaths.StorageFolder;
                var targetIndex = Path.Combine(target, "index.html");

                // index.html 里引用的是带内容哈希的 JS 文件名，所以"内容相同"
                // 就等价于"是同一份构建"，不必逐字节比整个 assets 目录。
                if (File.Exists(targetIndex) && SameContent(sourceIndex, targetIndex)) {
                    Logger.Debug("storage 里的前端已是最新，无需同步");
                    return;
                }

                Logger.Info("storage 里的前端与自带版本不一致，正在重新部署（原版 IA 会覆盖它）");

                // 只清前端目录。assets 里可能有上一个版本留下的哈希文件，
                // 不清掉会越积越多。
                var targetAssets = Path.Combine(target, "assets");
                if (Directory.Exists(targetAssets)) {
                    Directory.Delete(targetAssets, recursive: true);
                }

                CopyDirectory(Path.Combine(source, "assets"), targetAssets);
                File.Copy(sourceIndex, targetIndex, overwrite: true);

                Logger.Info("前端已重新部署到 storage");
            }
            catch (Exception ex) {
                // 失败不能让程序起不来——界面大不了还是旧的，但功能都在
                Logger.Warn("部署前端时出错（不影响程序其它功能）：" + ex.Message);
            }
        }

        private static bool SameContent(string a, string b) {
            try {
                var fa = new FileInfo(a);
                var fb = new FileInfo(b);
                if (fa.Length != fb.Length) {
                    return false;
                }

                return File.ReadAllText(a) == File.ReadAllText(b);
            }
            catch {
                return false;
            }
        }

        private static void CopyDirectory(string source, string target) {
            Directory.CreateDirectory(target);

            foreach (var file in Directory.GetFiles(source)) {
                File.Copy(file, Path.Combine(target, Path.GetFileName(file)), overwrite: true);
            }

            foreach (var dir in Directory.GetDirectories(source)) {
                CopyDirectory(dir, Path.Combine(target, Path.GetFileName(dir)));
            }
        }
    }
}
