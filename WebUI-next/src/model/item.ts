import type { IStat } from './stats';
import type { ISkill } from './skill';
import { IItemType } from './enums';

/** 复制品（共享仓库副本）的一行数据。 */
export interface IReplicaRow {
  text: string;
  type: number;
}

/**
 * ★ 核心领域模型：一件物品。
 *
 * 字段与 C# 的 `IAGrim/UI/Controller/dto/JsonItem.cs` **逐字段对应**，
 * 后端将来换成 HTTP 后结构不变，所以这里可以直接照搬。
 *
 * 命名注意：C# 序列化成小驼峰（`UniqueIdentifier` → `uniqueIdentifier`），
 * 所以 TS 侧与 JSON 同名，不需要做转换。
 */
export default interface IItem {
  /** 唯一标识，格式 `PI/{Id}/{CloudId}`（PlayerItem） */
  uniqueIdentifier: string;
  /** 用于判断"两件物品在界面上可以合并显示" */
  mergeIdentifier: string;
  baseRecord: string;
  /** 图标文件名，如 `items/gearhead/bitmaps/c216_head.tex`。前端拼成 /img/<icon> */
  icon: string;
  /** 品质，如 `Legendary` / `Epic` / `Blue` */
  quality: string;
  name: string;
  socket: string;
  level: number;
  /** 转移物品时回传给后端的标识数组（不是 URL，是历史命名） */
  url: Array<number | string>;
  type: IItemType;
  hasRecipe: boolean;
  /** 双绿（Monster Infrequent）的稀有度计数 */
  greenRarity: number;
  headerStats: IStat[];
  bodyStats: IStat[];
  petStats: IStat[];
  skill?: ISkill | null;
  hasCloudBackup?: boolean;
  slot?: string;
  extras?: string | undefined;
  isMonsterInfrequent?: boolean;
  isHardcore: boolean;
  replicaStats: IReplicaRow[];
}
