/**
 * 日志系统服务
 * 负责跟踪和记录游戏统计数据
 * 数据存储在 date.log 下
 */

import type { LogData, MessageVariables } from '@/types';
import { safeGet } from '@/utils';

/** 日志数据默认值 */
export const DefaultLogData: LogData = {
  deathCount: 0,
  maxCurrencyDebt: 0,
  bankruptcyCount: 0,
  illegalLevelUpId: [],
  totalFPGained: 0,
  timeRecord: {},
  locationRecord: {},
};

/**
 * 获取日志数据（从 date.log 获取，不存在则返回默认值的副本）
 */
const getLogData = (variables: MessageVariables): LogData => {
  const existingLog = safeGet(variables, 'date.log', null);
  if (existingLog) {
    return existingLog;
  } else {
    return _.cloneDeep(DefaultLogData);
  }
};

/**
 * 检测角色死亡
 * 当生命值从正数变为0或以下时计为死亡
 */
const checkDeath = (current: MessageVariables, old: MessageVariables, log: LogData): void => {
  if (!_.has(old, 'stat_data.主角.生命值.当前')) {
    return;
  }

  const currentHp = safeGet(current, 'stat_data.主角.生命值.当前', 1);
  const oldHp = safeGet(old, 'stat_data.主角.生命值.当前', 1);

  if (oldHp > 0 && currentHp <= 0) {
    log.deathCount++;
  }
};

/**
 * 检测货币欠款
 * 当金钱为负数时，记录最大欠款额度
 */
const checkCurrencyDebt = (current: MessageVariables, log: LogData): void => {
  const 金钱 = safeGet(current, 'stat_data.主角.金钱', 0);

  if (金钱 < 0) {
    const debt = Math.abs(金钱);
    if (debt > log.maxCurrencyDebt) {
      log.maxCurrencyDebt = debt;
    }
  }
};

/**
 * 检测破产
 * 当金钱从正数变为0或负数时计为破产
 */
const checkBankruptcy = (current: MessageVariables, old: MessageVariables, log: LogData): void => {
  if (!_.has(old, 'stat_data.主角.金钱')) {
    return;
  }

  const currentMoney = safeGet(current, 'stat_data.主角.金钱', 0);
  const oldMoney = safeGet(old, 'stat_data.主角.金钱', 0);

  if (oldMoney > 0 && currentMoney <= 0) {
    log.bankruptcyCount++;
  }
};

/**
 * 检测FP(命运点数)获取
 * 当命运点数增加时，累加到总获取量
 */
const checkFPGained = (current: MessageVariables, old: MessageVariables, log: LogData): void => {
  if (!_.has(old, 'stat_data.命运点数')) {
    return;
  }

  const currentFP = safeGet(current, 'stat_data.命运点数', 0);
  const oldFP = safeGet(old, 'stat_data.命运点数', 0);

  if (currentFP > oldFP) {
    const gained = currentFP - oldFP;
    log.totalFPGained += gained;
  }
};

/** Records against the update's captured message, never re-reads another floor. */
export const recordIllegalLevelUp = (variables: MessageVariables, messageId: number): void => {
  const log = getLogData(variables);
  if (!log.illegalLevelUpId.includes(messageId)) log.illegalLevelUpId.push(messageId);
  variables.date.log = log;
};

/**
 * 日志系统主函数
 * 在变量更新时检测并记录各种统计数据
 */
export const logSystem = (
  new_variables: MessageVariables,
  old_variables: MessageVariables
): void => {
  if (!_.has(old_variables, 'stat_data') || !_.has(new_variables, 'stat_data')) {
    return;
  }

  // 获取现有的日志数据
  const log = getLogData(new_variables);

  // 检测各种事件
  checkDeath(new_variables, old_variables, log);
  checkCurrencyDebt(new_variables, log);
  checkBankruptcy(new_variables, old_variables, log);
  checkFPGained(new_variables, old_variables, log);

  new_variables.date.log = log;
};
