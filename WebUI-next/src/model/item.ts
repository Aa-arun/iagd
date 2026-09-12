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
  /** 纯基础名（不含前后缀），由 C# 提供。见 model/affixes.ts */
  nameCore?: string;
  /** 前缀/后缀的 tag 名（如 tagPrefixB001_Sh_A），由 C# 提供 */
  prefixTag?: string;
  suffixTag?: string;
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

/**
 * 从 `uniqueIdentifier`（形如 `PI/{Id}/{CloudId}`）解析出 `PlayerItem.Id`。
 *
 * 转移物品时需要它——devapi 的转移接口收的就是这串 id。
 * 格式与 C# 的 `ItemHtmlWriter.GetUniqueIdentifier` 一致。
 */
export function playerItemId(item: IItem): number | null {
  const match = /^PI\/(\d+)\//.exec(item.uniqueIdentifier);
  return match ? Number(match[1]) : null;
}

/**
 * 物品的「类型」文本，如 `传奇双手锤`、`已附魔稀有勋章`。
 *
 * 来源是游戏 tooltip 里 `type = 66` 的那一行（`replicaStats`），
 * 也就是游戏自己渲染的"品质 + 槽位"组合。
 *
 * ★ 为什么用它替代"品质"（Epic / Blue / Green）：
 *   那些是数据库里的内部枚举名，对使用者没有意义；而游戏原版的
 *   "传奇双手锤"既说清了品质也说清了部位（使用者 2026-09-12 要求）。
 *   既然游戏已经把它给了我们，没必要自己拼。
 */
export function itemTypeLabel(item: IItem): string | null {
  const row = item.replicaStats?.find((r) => r.type === 66);
  const text = row?.text?.trim();
  return text ? text : null;
}
