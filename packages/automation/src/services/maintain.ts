/**
 * 数据维护服务
 * 负责维护角色数据的完整性和一致性
 */

import { recordIllegalLevelUp } from '@/services/log';
import { getRequiredXpForLevel, getTierForLevel } from '../config';
import type { MessageVariables } from '../types';
import { safeGet } from '../utils';
import { syncAscensionState } from './ascension';

/**
 * 维护角色数据的完整性
 *
 * @param new_variables - 更新后的变量数据
 * @param old_variables - 更新前的变量数据（由 MVU 事件提供）
 */
export const maintainCharacterData = (
  new_variables: MessageVariables,
  old_variables: MessageVariables,
  messageId: number
): void => {
  const character = safeGet(new_variables, 'stat_data.主角', {} as any);
  const hasOldLevel = _.has(old_variables, 'stat_data.主角.等级');
  const oldLevel = safeGet(old_variables, 'stat_data.主角.等级', 1);
  const isInitDryRun = messageId <= 2;

  // 登神长阶开启条件与任务同步
  syncAscensionState(new_variables, old_variables);

  // 防止等级被非法提升（允许经验满且外部预写升级等级）
  if (!isInitDryRun && hasOldLevel && oldLevel < character.等级) {
    const requiredXpNumber = Number(safeGet(character, '升级所需经验', 0));
    const expFull =
      Number.isFinite(requiredXpNumber) &&
      Number(safeGet(character, '累计经验值', 0)) >= requiredXpNumber;
    const isPrewriteLevelUp = expFull && character.等级 === oldLevel + 1;

    if (!isPrewriteLevelUp) {
      _.set(character, '等级', oldLevel);
      recordIllegalLevelUp(new_variables, messageId);
      toastr.warning('等级被AI非法提升,请检查变量更新');
    } else {
      _.set(character, '等级', oldLevel);
    }
  }

  // 更新升级所需经验
  _.set(character, '升级所需经验', getRequiredXpForLevel(character.等级));

  // 确保累计经验值不低于当前等级的最低要求，同时防止经验被意外降低
  if (character.等级 > 0) {
    const minExp = getRequiredXpForLevel(character.等级 - 1);
    const currentExp = Number(character.累计经验值) || 0;
    const oldExp = safeGet(old_variables, 'stat_data.主角.累计经验值', currentExp);
    // 取当前经验、最低要求和旧经验中的最大值，防止经验倒退
    const safeExp = Math.max(currentExp, Number(minExp) || 0, oldExp);
    if (character.累计经验值 !== safeExp) {
      _.set(character, '累计经验值', safeExp);
    }
  }

  // 更新生命层级
  _.set(character, '生命层级', getTierForLevel(character.等级));
};
