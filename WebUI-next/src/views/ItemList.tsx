import type IItem from '../model/item';
import { useItemDetail } from '../components/ItemDetail';
import { findView } from './registry';

interface Props {
  items: IItem[];
  viewId: string;
}

/**
 * 当前视图渲染出来的物品列表。
 *
 * 与工具条分开：工具条固定在滚动容器外面（不随列表滚），列表自己在容器里滚。
 * 视图组件本身仍然只接 `items` + 回调（见 views/types.ts 的架构约束）。
 */
export default function ItemList({ items, viewId }: Props) {
  const { onItemHover, onItemActivate, pinnedId } = useItemDetail();
  const View = findView(viewId).component;

  return (
    <View
      items={items}
      onItemHover={onItemHover}
      onItemActivate={onItemActivate}
      pinnedId={pinnedId}
    />
  );
}
