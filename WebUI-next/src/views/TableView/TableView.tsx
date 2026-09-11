import type { ItemViewProps } from '../types';
import { iconUrl } from '../../api';
import { qualityClass } from '../../components/ItemCard/quality';
import { slotLabel } from '../../model/slot';
import { useTranslation } from '../../i18n';
import './TableView.css';

/**
 * ① 分栏列表。
 *
 * 表格式，每件一行、关键信息**分栏对齐**——扫视与横向对比最强，
 * 最适合"精确找装备"这种场景（见 .docs/03-目标架构.md §6.2）。
 *
 * 用真正的 `<table>` 而不是 CSS grid：语义正确（表头与单元格有关系），
 * 屏幕阅读器能念出"名称/品质/等级"的对应关系，且天然支持列对齐。
 */
export default function TableView({
  items,
  onItemHover,
  onItemActivate,
  pinnedId,
}: ItemViewProps) {
  const t = useTranslation();

  return (
    <table className="item-table">
      <thead>
        <tr>
          <th scope="col" aria-label="图标" />
          <th scope="col">名称</th>
          <th scope="col">品质</th>
          <th scope="col">等级</th>
          <th scope="col">槽位</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.uniqueIdentifier}
            className={pinnedId === item.uniqueIdentifier ? 'is-pinned' : undefined}
            onMouseEnter={(e) => onItemHover?.(item, e.currentTarget)}
            onMouseLeave={() => onItemHover?.(null, null)}
            onClick={() => onItemActivate?.(item)}
          >
            <td className="item-table__icon-cell">
              {item.icon ? (
                <img
                  className="item-table__icon"
                  src={iconUrl(item.icon)}
                  alt=""
                  width={32}
                  height={32}
                  loading="lazy"
                />
              ) : null}
            </td>
            <td className={`item-table__name ${qualityClass(item.quality)}`}>{item.name}</td>
            <td className={qualityClass(item.quality)}>{item.quality}</td>
            <td className="item-table__num">{item.level}</td>
            <td>{slotLabel(item.slot, t)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
