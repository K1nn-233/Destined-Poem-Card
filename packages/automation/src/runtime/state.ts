import type { DateData } from '../types';
import { DefaultLogData } from '../services/log';
import { deepClone } from '../utils';

export const createDefaultDate = (): DateData => ({
  event: { cache: '', completed_events: [] },
  npcs: {},
  npcLevelUpWithPlayer: true,
  requiresContractForExp: true,
  ascensionLawReady: false,
  log: deepClone(DefaultLogData),
});

/** Fill missing internal fields while retaining user settings and unknown extension fields. */
export const prepareDate = (date: Partial<DateData> | undefined): DateData =>
  _.defaultsDeep({}, date, createDefaultDate());
