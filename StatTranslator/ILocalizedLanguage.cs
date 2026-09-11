namespace StatTranslator {
    public interface ILocalizedLanguage {
        string GetTag(string tag);

        string GetTag(string tag, params object[] args);

        string TranslateName(string prefix, string quality, string style, string name, string suffix);

        string TranslateName(string rawName);

        bool WarnIfMissing { get; }

        /// <summary>
        /// 导出**全部** tag → 文案。
        ///
        /// 线 B（B1）加的：HTTP 接口要用 `GET /api/i18n` 一次性把翻译表交给浏览器，
        /// 而原来的接口只能按 tag 单独取——浏览器那边拿不到 tag 清单。
        ///
        /// 注意名字带 Tags：`EnglishLanguage` 已有一个 `Export()`（导出为
        /// `key=value` 文本，用于「导出翻译文件」功能），两者不要混淆。
        /// </summary>
        IDictionary<string, string> ExportTags();
    }
}