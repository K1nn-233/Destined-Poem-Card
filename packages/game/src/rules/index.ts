/** 五维属性；输入归一化由调用方负责。 */
export interface Attributes {
  力量: number;
  敏捷: number;
  体质: number;
  智力: number;
  精神: number;
}

/** 与原自动化配置一致，取不大于等级的最高里程碑档位。 */
export const HpMultipliers: Readonly<Record<number, number>> = {
  1: 1,
  5: 2,
  9: 4,
  13: 10,
  17: 20,
  21: 40,
  25: 100,
};

export const MpSpMultipliers: Readonly<Record<number, number>> = {
  1: 1,
  5: 2.5,
  9: 6,
  13: 15,
  17: 35,
  21: 80,
  25: 160,
};

const lookupMultiplierByLevel = (
  table: Readonly<Record<number, number>>,
  level: number,
): number => {
  const validLevels = Object.keys(table)
    .map(Number)
    .filter((milestone) => level >= milestone);
  const highest = validLevels.length > 0 ? Math.max(...validLevels) : undefined;
  return highest === undefined ? table[1] : table[highest];
};

export const getHpMultiplier = (level: number): number =>
  lookupMultiplierByLevel(HpMultipliers, level);

export const getMpSpMultiplier = (level: number): number =>
  lookupMultiplierByLevel(MpSpMultipliers, level);

/** 仅计算基础上限；额外上限、当前值填满和夹紧由调用方处理。 */
export const calculateBaseResources = (
  level: number,
  attributes: Attributes,
): { hp: number; mp: number; sp: number } => {
  const { 力量, 敏捷, 体质, 智力, 精神 } = attributes;
  const totalAttrs = 力量 + 敏捷 + 体质 + 智力 + 精神;
  const hpMul = getHpMultiplier(level);
  const mpSpMul = getMpSpMultiplier(level);

  return {
    hp: Math.round(体质 * 100 * hpMul + totalAttrs),
    mp: Math.round((智力 + 精神) * 50 * mpSpMul),
    sp: Math.round((力量 + 敏捷) * 50 * mpSpMul),
  };
};
