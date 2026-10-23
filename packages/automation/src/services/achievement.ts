import type { MessageVariables } from '@/types';
import { DefaultLogData } from './log';

export function achievement(variables: MessageVariables) {
  const log = variables.date?.log ?? DefaultLogData;

  const achievements = [
    `☠️ 死亡次数: ${log.deathCount}`,
    `💰 货币最大欠款: ${log.maxCurrencyDebt} G`,
    `📉 破产次数: ${log.bankruptcyCount}`,
    `⚠️ AI非法提升等级次数: ${log.illegalLevelUpId.length}`,
  ];

  toastr.success(achievements.join('\n'), '“成就”', { timeOut: 10000 });
}
