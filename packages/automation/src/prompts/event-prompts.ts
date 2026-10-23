/**
 * 事件提示注入模块
 * 向上下文注入事件相关的提示信息
 */
import type { MessageVariables } from '../types';

/**
 * 注入事件提示
 * - 已完成事件列表
 * - 当前事件缓存信息
 * - 事件链激活提示
 *
 */
export const buildEventPrompts = (variables: MessageVariables): InjectionPrompt[] => {
  // 获取已完成事件列表
  const completedEvents: string[] = variables.date.event.completed_events;

  // 收集需要注入的提示
  const prompts: Array<{
    id: string;
    content: string;
    position?: 'none' | 'in_chat';
    depth?: number;
    role?: 'system' | 'user' | 'assistant';
  }> = [];

  // 注入已完成事件
  if (completedEvents.length > 0) {
    prompts.push({
      id: '已完成事件',
      content: completedEvents.join('; '),
      position: 'none',
      depth: 0,
      role: 'system',
    });
  }

  // 获取事件缓存信息
  const eventCache: string | null = variables.date.event.cache;

  // 如果有活跃事件，注入事件信息和提示
  if (!_.isNil(eventCache) && !_.isEmpty(eventCache)) {
    // 注入事件缓存
    prompts.push({
      id: '事件',
      content: eventCache,
      position: 'none',
      depth: 0,
      role: 'system',
    });

    // 注入事件链激活提示
    prompts.push({
      id: '事件提示',
      content:
        '（IMPORTANT: 当前剧情事件进行中，你必须按照<event>中内容发展剧情，不得太过偏离剧情事件）',
      position: 'in_chat',
      depth: 0,
      role: 'system',
    });
  }

  return prompts.map(prompt => ({ ...prompt, should_scan: true }) as InjectionPrompt);
};
