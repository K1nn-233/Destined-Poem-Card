/**
 * 事件处理服务
 * 管理事件链的开启、进行和结束
 */

import type { MessageVariables } from '../types';
import { safeGet } from '../utils';

/**
 * 处理事件状态
 * - 事件开启时记录开始时间和缓存信息
 * - 事件结束时清理状态并记录完成
 *
 * @param current_variables - 当前的变量数据
 */
export const processEvent = (current_variables: MessageVariables): boolean => {
  // 清理旧的注入
  uninjectPrompts(['已完成事件']);

  // 使用 safeGet 安全访问嵌套属性
  const isEventStarted = safeGet(current_variables, 'stat_data.事件.开启', false);
  const isEventEnded = safeGet(current_variables, 'stat_data.事件.结束', false);
  const eventTitle = safeGet(current_variables, 'stat_data.事件.标题', '');
  const eventStep = safeGet(current_variables, 'stat_data.事件.阶段', '');
  const completedEvents: string[] = safeGet(current_variables, 'stat_data.事件.已完成事件', []);

  current_variables.date.event.completed_events = completedEvents;
  if (isEventStarted) {
    current_variables.date.event.cache = `当前事件为${eventTitle}，当前步骤为${eventStep}`;
  }

  let shouldDeleteEventCache = false;

  // 事件结束处理
  if (isEventEnded) {
    // 清理事件相关的注入
    uninjectPrompts(['事件', '事件提示']);

    // 记录完成的事件
    const updatedCompletedEvents = [...completedEvents, `已完成事件${eventTitle}`];

    // 使用 safeGet 获取事件链引用，然后安全地设置值
    const eventChain = safeGet(current_variables, 'stat_data.事件', null);
    if (!_.isNil(eventChain)) {
      // 重置事件状态
      _.set(eventChain, '已完成事件', updatedCompletedEvents);
      _.set(eventChain, '标题', '');
      _.set(eventChain, '阶段', '');
      _.set(eventChain, '结束', false);
      _.set(eventChain, '开启', false);
    }

    // 延迟到本轮处理结束后统一删除
    shouldDeleteEventCache = true;
  }

  return shouldDeleteEventCache;
};
