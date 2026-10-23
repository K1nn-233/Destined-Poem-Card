import { Schema } from '@destiny/game/schema';
import type { MessageVariables } from '../types';
import { maintainCharacterData } from '../services/maintain';
import { processExperienceAndLevel } from '../services/experience';
import { processNPCExperienceAndLevel } from '../services/npc-experience';
import { calculateResourceLimits } from '../services/resource-calculator';
import { processEvent } from '../services/event';
import { logSystem } from '../services/log';
import { deepClone, uninject } from '../utils';
import { prepareDate } from './state';
import { captureUpdateTarget, writeDate, deleteEventCache } from './host';

export const handleVariableUpdate = (data: Mvu.MvuData, before: Mvu.MvuData): void => {
  const messageId = captureUpdateTarget();
  // Prepare the actual event object; all services and MVU's later write see the same state.
  data.date = prepareDate(data.date);
  const parsed = Schema.safeParse(data.stat_data);
  if (!parsed.success) console.error('[命定之诗] stat_data 校验失败', parsed.error);
  data.stat_data = deepClone(parsed.success ? parsed.data : data.stat_data);
  const current = data as unknown as MessageVariables;
  const old = { stat_data: before.stat_data, date: prepareDate(before.date) } as MessageVariables;
  writeDate(current, messageId);
  uninject();
  maintainCharacterData(current, old, messageId);
  writeDate(current, messageId);
  processExperienceAndLevel(current, old);
  writeDate(current, messageId);
  processNPCExperienceAndLevel(current, old, messageId);
  writeDate(current, messageId);
  calculateResourceLimits(current, old);
  const shouldDeleteEventCache = processEvent(current);
  writeDate(current, messageId);
  logSystem(current, old);
  writeDate(current, messageId);
  if (shouldDeleteEventCache) deleteEventCache(current, messageId);
};
