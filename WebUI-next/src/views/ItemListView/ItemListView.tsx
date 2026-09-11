import type IItem from '../../model/item';
import ItemCard from '../../components/ItemCard/ItemCard';
import './ItemListView.css';

/**
 * 物品列表视图。
 *
 * A1 阶段只负责"把一批物品排成一列"。
 * 将来（A4）会有多种可切换的展示样式，届时这个组件会成为其中一种，
 * 由 `views/ViewSwitcher` 来选择——所以它只接收 `items`，自己不管数据从哪来。
 */
export default function ItemListView({ items }: { items: IItem[] }) {
  return (
    <ul className="item-list">
      {items.map((item) => (
        // key 用 uniqueIdentifier（形如 PI/{Id}/{CloudId}），它在库里唯一，
        // 比数组下标可靠：列表增删时 React 靠它判断谁是谁。
        <li key={item.uniqueIdentifier}>
          <ItemCard item={item} />
        </li>
      ))}
    </ul>
  );
}
