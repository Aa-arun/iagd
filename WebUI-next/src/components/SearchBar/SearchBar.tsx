import './SearchBar.css';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 搜索框。
 *
 * 它只做"输入 → 通知上层"这一件事，**不自己发请求**——
 * 防抖与查询在 App 里统一处理，这样换数据源（devapi → C# 后端）时这里不用动。
 */
export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="search"
        className="search-bar__input"
        // 提示空格语义：这是后端 wildcard 的特性，用户不知道就会少用
        placeholder="搜索物品名（空格分隔多个关键词，如「神话 面具」）"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="搜索物品"
        autoComplete="off"
      />

      {value && (
        <button
          type="button"
          className="search-bar__clear"
          title="清空"
          aria-label="清空搜索"
          onClick={() => onChange('')}
        >
          ×
        </button>
      )}
    </div>
  );
}
