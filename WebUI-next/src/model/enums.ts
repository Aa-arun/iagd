/**
 * 全局枚举。
 *
 * 这些是**从 C# 侧沿用**的编号，改动会导致两边不一致，不要随意调整顺序。
 */

/** 物品来源类型。与 C# 的 ItemTypeDto / 旧前端 IItemType 保持一致。 */
export enum IItemType {
  Recipe = 0,
  Buddy = 1,
  Player = 2,
  Augmentation = 3,
}

/**
 * WebSocket 推送消息的类型编号。
 *
 * 设计原则（见 .docs/03-目标架构.md §4.3）：**只换传输层，不改消息语义**。
 * 所以这些编号与旧前端、与 C# 侧完全一致，将来后端改造时两边的
 * `switch` 几乎可以原样保留。
 */
export enum IOMessageType {
  ShowHelp = 0,
  ShowMessage = 1,
  ShowCharacterBackups = 2,
  SetState = 3,
  SetAggregateItemData = 4,
  /** 搜索结果 */
  SetItems = 5,
  /** 图鉴数据 */
  SetCollectionItems = 6,
  ShowModFilterWarning = 7,
  UpdateCloudIconStatus = 8,
  /** 物品属性延迟加载（打开详情面板时才拉） */
  UpdateItemStats = 9,
}
