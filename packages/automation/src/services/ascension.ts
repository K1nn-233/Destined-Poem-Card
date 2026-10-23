/**
 * 登神长阶相关逻辑
 */

import { GameConfig } from '../config';
import type { MessageVariables, QuestList } from '../types';
import { safeGet } from '../utils';

export const AscensionBlockLevels = [12, 16, 20, 24] as const;

const AscensionQuestIds = {
  element: '登神·启明之阶',
  power: '登神·铸权之仪',
  law: '登神·定律誓约',
  godPosition: '登神·登神仪式',
  godNation: '登神·神国初立',
} as const;

const AscensionQuests = {
  [AscensionQuestIds.element]: {
    状态: '进行中',
    关注度: '高',
    进展: '尚未开始收集要素。',
    详情: '等级已锁，无法获取经验，需满足条件：获取至少 1 个要素。',
    目标: '以一枚要素点燃登神之火，让长阶回应你的名。',
    奖励: '长阶初启，神火与要素共鸣。',
  },
  [AscensionQuestIds.power]: {
    状态: '进行中',
    关注度: '高',
    进展: '权能尚未开始融合。',
    详情: '等级已锁，无法获取经验，需满足条件：融合 3 个要素为 1 个权能。',
    目标: '三要素归一，淬炼成唯一权能。',
    奖励: '权能成形，诸力归位于你。',
  },
  [AscensionQuestIds.law]: {
    状态: '进行中',
    关注度: '高',
    进展: '法则源质未准备就绪。',
    详情: '等级已锁，无法获取经验，需满足条件：以权能融合法则源质，铸成法则。',
    目标: '寻得法则源质，与权能相合，点燃法则真名。',
    奖励: '法则凝就，秩序向你低首。',
  },
  [AscensionQuestIds.godPosition]: {
    状态: '进行中',
    关注度: '高',
    进展: '登神仪式尚未筹备。',
    详情: '等级已锁，无法获取经验，需满足条件：获得神位。',
    目标: '行登神之礼，确立神位。',
    奖励: '神位应诺，尊名刻入天穹。',
  },
  [AscensionQuestIds.godNation]: {
    状态: '进行中',
    关注度: '高',
    进展: '神国建设尚未启动。',
    详情: '完成条件：建立神国。',
    目标: '赐予神国之名，令其在诸界立足。',
    奖励: '神国初立，法则之缚自此尽解。',
  },
} as const;

const LawSourceTagPattern = /法则源质/;
const LawSourceNamePattern = /^༺.+༻$/;

const getRequiredXpNumber = (character: Record<string, any>): number | null => {
  const requiredXp = Number(safeGet(character, '升级所需经验', 0));
  return Number.isFinite(requiredXp) ? requiredXp : null;
};

const isLawSourceItem = (item: Record<string, any>, itemName: string): boolean => {
  if (!LawSourceNamePattern.test(String(itemName))) {
    return false;
  }

  const tags = safeGet(item, '标签', [] as string[]);

  if (!Array.isArray(tags)) {
    return false;
  }

  return tags.some(tag => LawSourceTagPattern.test(String(tag)));
};

const getLawSourceKeys = (backpack: Record<string, any>): string[] => {
  return _.filter(_.keys(backpack), itemKey => {
    const item = safeGet(backpack, itemKey, {} as any);
    return isLawSourceItem(item, String(itemKey));
  });
};

const hasLawSourceInBackpack = (backpack: Record<string, any>): boolean => {
  return getLawSourceKeys(backpack).length > 0;
};

const consumeLawSourceFromBackpack = (backpack: Record<string, any>, keys: string[]): boolean => {
  if (keys.length !== 1) {
    return false;
  }

  _.forEach(keys, itemKey => {
    _.unset(backpack, itemKey);
  });

  return true;
};

const isExpFull = (character: Record<string, any>): boolean => {
  const requiredXp = getRequiredXpNumber(character);
  return requiredXp !== null && safeGet(character, '累计经验值', 0) >= requiredXp;
};

const upsertQuest = (quests: QuestList, quest_id: string): void => {
  if (!_.has(quests, quest_id)) {
    _.set(quests, quest_id, AscensionQuests[quest_id as keyof typeof AscensionQuests]);
  }
};

const removeQuest = (quests: QuestList, quest_id: string): void => {
  if (_.has(quests, quest_id)) {
    _.unset(quests, quest_id);
  }
};

// 统计登神长阶关键数据
export const getAscensionCounts = (ascension: Record<string, any>) => {
  return {
    elementCount: _.size(safeGet(ascension, '要素', {} as any)),
    powerCount: _.size(safeGet(ascension, '权能', {} as any)),
    lawCount: _.size(safeGet(ascension, '法则', {} as any)),
    hasGodPosition: !!safeGet(ascension, '神位', ''),
    hasGodNationName: !!safeGet(ascension, '神国.名称', ''),
  };
};

// 关键等级晋升需要满足登神长阶的突破条件
export const canBreakAscensionLevel = (
  current_level: number,
  variables: MessageVariables
): boolean => {
  if (!AscensionBlockLevels.includes(current_level as (typeof AscensionBlockLevels)[number])) {
    return true;
  }

  const character = safeGet(variables, 'stat_data.主角', {} as any);
  const ascension = safeGet(character, '登神长阶', {} as any);
  const { elementCount, powerCount, lawCount, hasGodPosition } = getAscensionCounts(ascension);

  switch (current_level) {
    case 12:
      return elementCount > 0;
    case 16:
      return powerCount > 0;
    case 20:
      return lawCount > 0;
    case 24:
      return lawCount > 0 && hasGodPosition;
    default:
      return true;
  }
};

// 同步登神长阶任务与状态
export const syncAscensionState = (
  variables: MessageVariables,
  old_variables?: MessageVariables
): void => {
  const character = safeGet(variables, 'stat_data.主角', {} as any);
  const quests = safeGet(variables, 'stat_data.任务列表', {} as QuestList);
  const ascension = safeGet(character, '登神长阶', {} as any);
  const { elementCount, powerCount, lawCount, hasGodPosition, hasGodNationName } =
    getAscensionCounts(ascension);
  const level = Number(safeGet(character, '等级', 1));
  const expFull = isExpFull(character);
  const backpack = safeGet(character, '背包', {} as any);
  const lawSourceKeys = getLawSourceKeys(backpack);
  const lawSourceReady = lawSourceKeys.length > 0;
  const oldAscension = safeGet(old_variables ?? ({} as any), 'stat_data.主角.登神长阶', {} as any);
  const prevLawCount = _.size(safeGet(oldAscension, '法则', {} as any));
  const oldBackpack = safeGet(old_variables ?? ({} as any), 'stat_data.主角.背包', {} as any);
  const hadLawSource = hasLawSourceInBackpack(oldBackpack);

  // 未获得法则源质时，禁止在20级阶段写入法则
  // 如果之前有源质（说明刚被消耗用于铸造法则），允许写入
  if (level === 20 && lawCount > 0 && !lawSourceReady && !hadLawSource) {
    _.set(character, '登神长阶.法则', {});
  }

  const unlockAscension = level >= GameConfig.AscensionUnlockLevel || (level === 12 && expFull);
  _.set(character, '登神长阶.是否开启', safeGet(ascension, '是否开启', false) || unlockAscension);

  if (level === 12 && expFull && elementCount === 0) {
    upsertQuest(quests, AscensionQuestIds.element);
  } else {
    removeQuest(quests, AscensionQuestIds.element);
  }

  if (level === 16 && expFull && elementCount === 3 && powerCount === 0) {
    upsertQuest(quests, AscensionQuestIds.power);
  } else {
    removeQuest(quests, AscensionQuestIds.power);
  }

  if (level === 20 && expFull && powerCount >= 1 && lawCount === 0) {
    upsertQuest(quests, AscensionQuestIds.law);
  } else {
    removeQuest(quests, AscensionQuestIds.law);
  }

  if (level === 24 && expFull && lawCount >= 1 && !hasGodPosition) {
    upsertQuest(quests, AscensionQuestIds.godPosition);
  } else {
    removeQuest(quests, AscensionQuestIds.godPosition);
  }

  if (level === 25 && lawCount >= 2 && !hasGodNationName) {
    upsertQuest(quests, AscensionQuestIds.godNation);
  } else {
    removeQuest(quests, AscensionQuestIds.godNation);
  }

  if (prevLawCount === 0 && lawCount > 0) {
    // 仅在法则首次生成时消耗源质，且源质大于等于 2 个时不自动处理
    consumeLawSourceFromBackpack(backpack, lawSourceKeys);
  }

  _.set(variables, 'date.ascensionLawReady', hasLawSourceInBackpack(backpack));
};
