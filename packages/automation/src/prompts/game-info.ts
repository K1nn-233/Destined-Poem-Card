/**
 * 游戏信息注入模块
 * 向上下文注入当前游戏状态信息
 */

import type { MessageVariables } from '../types';
import { safeGet } from '../utils';

/**
 * 注入游戏信息
 * - 用户角色种族
 * - 当前地点
 * - 当前时间
 *
 * @param current_variables - 当前的变量数据
 */
export const buildGameInfo = (current_variables: MessageVariables): InjectionPrompt[] => {
  // 使用 safeGet 安全访问嵌套属性
  const worldLocation = safeGet(current_variables, 'stat_data.世界.地点', '未知');
  const worldTime = safeGet(current_variables, 'stat_data.世界.时间', '未知');
  const characterSpecies = safeGet(current_variables, 'stat_data.主角.种族', '未知');

  // 批量注入游戏信息
  return [
    {
      id: '主角种族',
      content: characterSpecies,
      position: 'none',
      depth: 0,
      role: 'system',
    },
    {
      id: '当前所在地点',
      content: worldLocation,
      position: 'none',
      depth: 0,
      role: 'system',
    },
    {
      id: '当前时间',
      content: worldTime,
      position: 'none',
      depth: 0,
      role: 'system',
    },
  ].map(prompt => ({ ...prompt, should_scan: true }) as InjectionPrompt);
};
