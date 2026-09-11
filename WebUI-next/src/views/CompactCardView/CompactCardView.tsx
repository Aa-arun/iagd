import type { ItemViewProps } from '../types';
import ItemCard from '../../components/ItemCard/ItemCard';
import './CompactCardView.css';

/**
 * ② 简洁卡片。
 *
 * 自适应网格：窗口宽就多排几列。比列表活泼，适合"快速浏览"。
 *
 * 卡片本体复用 `components/ItemCard`——视图只负责**怎么排**，
 * 单个物品长什么样是组件的职责。
 */
export default function CompactCardView({ items }: ItemViewProps) {
  return (
    <ul className="compact-grid">
      {items.map((item) => (
        <li key={item.uniqueIdentifier}>
          <ItemCard item={item} />
        </li>
      ))}
    </ul>
  );
}
