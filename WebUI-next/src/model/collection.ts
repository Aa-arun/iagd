/**
 * 图鉴里的一条：游戏里存在这个物品，以及玩家拥有几件。
 *
 * 对应后端的 `GET /api/collection`（原 `RequestCollectionData()`）。
 */
export default interface ICollectionItem {
  baseRecord: string;
  name: string;
  icon: string;
  /** 普通模式拥有数 */
  numOwnedSc: number;
  /** 硬核模式拥有数 */
  numOwnedHc: number;
  quality: string;
}
