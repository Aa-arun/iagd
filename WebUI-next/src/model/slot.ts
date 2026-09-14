/**
 * 槽位显示名的映射。
 *
 * **逐条复刻 C# 的 `StatTranslator/SlotTranslator.cs`**——
 * 那边把槽位值映射到一个 i18n 标签，再取本地化文本；这里做同样的事。
 * 文案来自 `/api/i18n`（后端合并了游戏的 `ItemTag` 表与 IA 的
 * `IAGrim/Resources/translations/zh.txt`，共 807 条界面文案）。
 */
const SLOT_TAGS: Record<string, string> = {
  ArmorProtective_Head: 'iatag_slot_head',
  ArmorProtective_Hands: 'iatag_slot_hands',
  ArmorProtective_Feet: 'iatag_slot_feet',
  ArmorProtective_Legs: 'iatag_slot_legs',
  ArmorProtective_Chest: 'iatag_slot_chest',
  ArmorProtective_Waist: 'iatag_slot_belt',
  ArmorProtective_Shoulders: 'iatag_slot_shoulder',
  ArmorJewelry_Medal: 'iatag_slot_medal',
  ArmorJewelry_Ring: 'iatag_slot_ring',
  ArmorJewelry_Amulet: 'iatag_slot_neck',
  WeaponMelee_Dagger: 'iatag_slot_dagger1h',
  WeaponMelee_Mace: 'iatag_slot_mace1h',
  WeaponMelee_Axe: 'iatag_slot_axe1h',
  WeaponMelee_Scepter: 'iatag_slot_scepter1h',
  WeaponMelee_Sword: 'iatag_slot_sword1h',
  WeaponMelee_Sword2h: 'iatag_slot_sword2h',
  WeaponMelee_Mace2h: 'iatag_slot_mace2h',
  WeaponMelee_Axe2h: 'iatag_slot_axe2h',
  WeaponMelee_Spear2h: 'iatag_slot_spear2h',
  WeaponHunting_Ranged1h: 'iatag_slot_ranged1h',
  WeaponHunting_Ranged2h: 'iatag_slot_ranged2h',
  WeaponArmor_Offhand: 'iatag_slot_offhand',
  WeaponArmor_Shield: 'iatag_slot_shield',
  ItemRelic: 'iatag_slot_component',
  ItemArtifact: 'iatag_slot_relic',
  ItemFactionBooster: 'iatag_slot_scroll',
  ItemFactionWarrant: 'iatag_slot_warrant',
  ItemEnchantment: 'iatag_slot_augmentation',
};

/**
 * 把槽位值翻成可显示的文本。
 *
 * 查不到映射时**原样返回**（而不是空串）——界面上会直接露出
 * `SomeNew_Slot` 这样的原始值，便于发现"出现了没见过的槽位"。
 */
export function slotLabel(slot: string | undefined, t: (key: string) => string): string {
  if (!slot) return '';
  const tag = SLOT_TAGS[slot];
  return tag ? t(tag) : slot;
}

/**
 * 是不是**首饰**（勋章 / 项链 / 戒指）。
 *
 * ★ 为什么单独判它：首饰的图标是 **32×32 的小方图**，而其它部位多是
 *   64×64 甚至 32×96 的长图（实测 `storage/*.tex.png`）。把小图放大到 64
 *   就发糊——所以三处图标（简洁卡片 / 详情面板 / 详细对照）统一：
 *   **外框 64×64 不变，首饰只显示原尺寸 32×32**（使用者 2026-09-14）。
 *
 * ⚠️ 实测 `/api/items` 返回的 `slot` 是**本地化文本**（"戒指"/"勋章"/"项链"），
 *   不是 `SlotTranslator` 的原始键——C# 侧 `ItemHtmlWriter` 已经翻译过一道。
 *   所以这里**两种写法都认**：中文（当前实际值）与原始键（将来若改回）。
 */
const JEWELRY_LABELS = new Set(['勋章', '戒指', '项链']);
const JEWELRY_KEYS = ['ArmorJewelry_Medal', 'ArmorJewelry_Ring', 'ArmorJewelry_Amulet'];

export function isJewelrySlot(slot: string | undefined): boolean {
  if (!slot) return false;
  return JEWELRY_LABELS.has(slot) || JEWELRY_KEYS.includes(slot);
}
