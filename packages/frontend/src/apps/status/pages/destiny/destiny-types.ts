/** 字段类型 */
export type FieldType = 'text' | 'number' | 'textarea' | 'tags' | 'toggle' | 'keyvalue';
export type PartnerListCategory = 'all' | 'present' | 'away' | 'contracted';
export type PartnerDetailSection =
  | 'overview'
  | 'status'
  | 'equipment'
  | 'skills'
  | 'inventory'
  | 'assets'
  | 'gallery';

export type PartnerRecord = Record<string, any>;
export type PartnerAssetSectionConfig = {
  key: Extract<PartnerDetailSection, 'equipment' | 'skills' | 'inventory' | 'assets'>;
  label: string;
  dataKey: '装备' | '技能' | '背包' | '资产';
  filterKey: string;
  itemCategory: 'equipment' | 'skill' | 'item' | 'asset';
  emptyText: string;
};

/** 伙伴资源条配置（上限 = 上限._基础 + 上限.额外，_基础 只读，额外 可编辑） */
export const PartnerResourceFields = [
  {
    label: 'HP',
    key: '生命值',
    type: 'hp' as const,
    icon: 'game-icons:heart-plus',
  },
  {
    label: 'MP',
    key: '法力值',
    type: 'mp' as const,
    icon: 'game-icons:water-drop',
  },
  {
    label: 'SP',
    key: '体力值',
    type: 'sp' as const,
    icon: 'game-icons:focused-lightning',
  },
] as const;

export const PartnerListCategories: Array<{
  key: PartnerListCategory;
  label: string;
  matches: (partner: PartnerRecord) => boolean;
}> = [
  { key: 'all', label: '全部', matches: () => true },
  { key: 'present', label: '在场', matches: partner => Boolean(partner.在场) },
  { key: 'away', label: '不在场', matches: partner => !partner.在场 },
  { key: 'contracted', label: '已缔约', matches: partner => Boolean(partner.命定契约) },
];

export const PartnerAssetSections: PartnerAssetSectionConfig[] = [
  {
    key: 'equipment',
    label: '装备',
    dataKey: '装备',
    filterKey: '类型',
    itemCategory: 'equipment',
    emptyText: '暂无装备',
  },
  {
    key: 'skills',
    label: '技能',
    dataKey: '技能',
    filterKey: '类型',
    itemCategory: 'skill',
    emptyText: '暂无技能',
  },
  {
    key: 'inventory',
    label: '背包',
    dataKey: '背包',
    filterKey: '类型',
    itemCategory: 'item',
    emptyText: '背包空空如也',
  },
  {
    key: 'assets',
    label: '资产',
    dataKey: '资产',
    filterKey: '类型',
    itemCategory: 'asset',
    emptyText: '暂无资产',
  },
];

export const renameRecordKey = <T>(
  record: Record<string, T>,
  currentName: string,
  nextName: string,
) => {
  if (!Object.hasOwn(record, currentName)) return record;
  const nextRecord = { ...record, [nextName]: record[currentName] };
  delete nextRecord[currentName];
  return nextRecord;
};
