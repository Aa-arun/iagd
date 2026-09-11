/**
 * 维护任务的阶段名 / 任务名 → 中文。
 *
 * 后端的 `ParsingService` 直接报英文阶段名（`LoadingItems` 之类）——那是它内部
 * 的步骤标识，翻译成中文是**展示层**的事，所以映射放前端。
 */

const PHASE_LABELS: Record<string, string> = {
  // ── 加载数据库（ParsingService.Phases，顺序即执行顺序）──
  LoadingTags: '读取文本标签',
  SavingTags: '保存文本标签',
  LoadingItems: '读取物品定义',
  MappingItemNames: '映射物品名称',
  MappingPetStats: '映射宠物属性',
  SavingItems: '保存物品',
  IndexingItems: '建立索引',
  GeneratingSpecialStats: '生成特殊属性',
  SavingSpecialStats: '保存特殊属性',
  GeneratingSkills: '解析技能',
  SkillCorrectnessCheck: '校验技能',

  // ── 重算物品属性（MaintenanceService.UpdateItemStats）──
  UpdatingItemStats: '重算物品属性',
};

const TASK_LABELS: Record<string, string> = {
  loadDatabase: '加载游戏数据库',
  cleanDatabase: '清除游戏数据库',
  clearCache: '更新项目统计',
};

/** 阶段名的中文。未知阶段名原样返回——宁可显示英文，也不要空着。 */
export function phaseLabel(phase?: string): string {
  if (!phase) return '';
  return PHASE_LABELS[phase] ?? phase;
}

/** 任务名的中文。 */
export function taskLabel(task?: string): string {
  if (!task) return '维护';
  return TASK_LABELS[task] ?? task;
}
