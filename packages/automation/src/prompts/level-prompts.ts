/**
 * 升级提示注入模块
 * 向上下文注入等级提升相关的提示信息
 *
 * 设计说明：
 * - 从 date.levelUpCharacter / date.levelUpNpcs 生成内容
 * - 宿主读取、注入和消费由 runtime/prompts 统一执行
 */
import type { MessageVariables } from '../types';
import { safeGet } from '../utils';

/**
 * 注入升级提示
 * - 主角成长聚合提示
 * - NPC 成长聚合提示
 */
export const buildLevelPrompts = (variables: MessageVariables): InjectionPrompt[] => {
  // 获取升级数据
  const characterLevelUp = safeGet(variables, 'date.levelUpCharacter', null as string[] | null);
  const npcLevelUp = safeGet(variables, 'date.levelUpNpcs', null as string[] | null);

  // 如果没有升级数据，直接返回
  if (!characterLevelUp && !npcLevelUp) {
    return [];
  }

  // 收集需要注入的提示
  const prompts: Array<{
    id: string;
    content: string;
    position?: 'none' | 'in_chat';
    depth?: number;
    role?: 'system' | 'user' | 'assistant';
  }> = [];

  // 主角升级提示
  if (characterLevelUp && characterLevelUp.length > 0) {
    prompts.push({
      id: '等级提升',
      content: `core_system: ${characterLevelUp.join('; ')}`,
      position: 'in_chat',
      depth: 0,
      role: 'system',
    });
  }

  // NPC 升级提示
  if (npcLevelUp && npcLevelUp.length > 0) {
    prompts.push({
      id: 'NPC等级提升',
      content: `core_system: ${npcLevelUp.join('; ')}`,
      position: 'in_chat',
      depth: 0,
      role: 'system',
    });
  }

  return prompts.map(prompt => ({ ...prompt, should_scan: true }) as InjectionPrompt);
};
