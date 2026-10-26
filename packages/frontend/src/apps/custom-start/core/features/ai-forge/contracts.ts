import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { RARITY_MAP } from '../../data/constants';
import type { Asset, Equipment, Item, Partner, Rarity, Skill } from '../../types';
import {
  calculateAssetCostByPosition,
  calculateCostByPosition,
  calculateDestinedCost,
} from '../../utils/cost-calculator';

export const CATEGORIES = ['equipment', 'item', 'asset', 'skill'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  equipment: '武器',
  item: '道具',
  asset: '资产',
  skill: '技能',
};
export const DEFAULT_COUNTS = { equipment: 2, item: 2, asset: 0, skill: 4 };
export type Requirements = Record<Category, { count: number; requirement: string }>;
/** 只校验本次勾选的分类；清空数量或设为0表示本次不生成。 */
export function resolveItemCategories(
  requirements: Requirements,
  selected: Category[],
): Category[] {
  if (!selected.length) throw new Error('请至少勾选一个生成分类');
  const result: Category[] = [];
  for (const category of new Set(selected)) {
    if (!CATEGORIES.includes(category)) throw new Error('生成分类无效');
    const count: unknown = requirements[category]?.count;
    if (count === '' || count == null || count === 0) continue;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 10)
      throw new Error(`${CATEGORY_LABELS[category]}数量须为0–10的整数`);
    result.push(category);
  }
  if (!result.length) throw new Error('已勾选分类的数量为空或0，请至少设置一项');
  return result;
}
export const TIER_NAMES = [
  '第一层级 (普通)',
  '第二层级 (中坚)',
  '第三层级 (精英)',
  '第四层级 (史诗)',
  '第五层级 (传说)',
  '第六层级 (神话)',
  '第七层级 (神祗)',
];
export function levelsForTier(tier: number): number[] {
  const min = (tier - 1) * 4 + 1;
  return Array.from({ length: tier === 7 ? 1 : 4 }, (_, i) => min + i);
}
export const PartnerGenerationSchema = z
  .object({
    tier: z.number().int().min(1).max(7),
    level: z.number().int().min(1).max(25),
    equipmentCount: z.number().int().min(0).max(10),
    skillCount: z.number().int().min(0).max(20),
  })
  .refine(v => Math.ceil(v.level / 4) === v.tier, '等级须与选定层级一致');
export type PartnerGenerationOptions = z.infer<typeof PartnerGenerationSchema>;

const text = z.string().trim().max(12000);
const name = text
  .min(1, '名称不能为空')
  .max(120)
  .refine(
    value => !['__proto__', 'constructor', 'prototype'].includes(value),
    '名称不可使用保留字',
  );
const rarity = z.preprocess(
  value => {
    return Object.entries(RARITY_MAP).find(([, label]) => label === value)?.[0] ?? value;
  },
  z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'only']),
);
const tags = z.array(text.min(1)).max(40).default([]);
const effects = z.record(name, text.min(1)).refine(v => Object.keys(v).length <= 30, '效果过多');
const baseShape = {
  name,
  rarity,
  type: text.min(1, '类型不能为空'),
  tag: tags,
  effect: effects,
  description: text.min(1, '描述不能为空'),
};
const skill = z
  .object({ ...baseShape, type: z.enum(['主动', '被动']), consume: text.default('') })
  .refine(v => Object.keys(v.effect).length > 0, '技能至少需要一项效果')
  .refine(v => v.type !== '主动' || v.consume.length > 0, '主动技能必须填写消耗');
const equipment = z
  .object({ ...baseShape, position: text.default('') })
  .refine(v => Object.keys(v.effect).length > 0, '装备至少需要一项效果');
const internalAsset = z.object({
  品质: rarity,
  标签: tags,
  数量: z.number().int().min(1).max(100000),
  效果: effects,
  描述: text,
  总占用空间: text,
});
export const ItemDraftSchema = z
  .object({
    id: z.string(),
    category: z.enum(CATEGORIES),
    ...baseShape,
    consume: text.default(''),
    quantity: z.number().int().min(1).max(999).default(1),
    position: text.default(''),
    totalSpace: text.default(''),
    settlement: text.default(''),
    location: text.default(''),
    internalAssets: z.record(name, internalAsset).default({}),
  })
  .superRefine((v, ctx) => {
    const problem = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (v.category === 'asset') {
      if (!v.totalSpace || !v.settlement || !v.location)
        problem('资产须填写总空间、结算和位置（无对应内容可填“不适用”）');
    } else if (Object.keys(v.effect).length === 0) problem('至少需要一项效果');
    if (v.category === 'skill') {
      if (!['主动', '被动'].includes(v.type)) problem('技能类型须为主动或被动');
      if (v.type === '主动' && !v.consume) problem('主动技能必须填写消耗');
    }
  });
export type ItemDraft = z.infer<typeof ItemDraftSchema>;
const nestedEffects = z.record(name, effects);
export const PartnerDraftSchema = z
  .object({
    name,
    level: z.number().int().min(1).max(25),
    race: text.min(1),
    identity: tags,
    career: tags,
    personality: text.min(1),
    like: text.default(''),
    app: text.min(1),
    cloth: text.min(1),
    backgroundInfo: text.min(1),
    attributes: z.object({
      strength: z.number().int().min(0).max(20),
      dexterity: z.number().int().min(0).max(20),
      constitution: z.number().int().min(0).max(20),
      intelligence: z.number().int().min(0).max(20),
      mind: z.number().int().min(0).max(20),
    }),
    equip: z.array(equipment).max(10),
    skills: z.array(skill).max(20),
    stairway: z.object({
      isOpen: z.boolean(),
      elements: nestedEffects.default({}),
      powers: nestedEffects.default({}),
      laws: nestedEffects.default({}),
      godlyRank: text.default(''),
      godKingdom: z
        .object({ name: text, description: text })
        .default({ name: '', description: '' }),
    }),
    isContract: z.boolean().default(false),
    affinity: z.number().int().min(-100).max(100).default(0),
  })
  .superRefine((v, ctx) => {
    const problem = (message: string) => ctx.addIssue({ code: 'custom', message });
    const tier = Math.ceil(v.level / 4);
    const values = Object.values(v.attributes);
    const baseTotal = values.reduce((a, b) => a + b, 0) - 5 * (tier - 1) - (v.level - 1);
    if (
      values.some(n => n < tier - 1 || n > 6 + tier * 2) ||
      baseTotal < 0 ||
      baseTotal > 25 ||
      values.reduce((n, a) => n + Math.max(0, a - (tier - 1) - 6), 0) > v.level - 1
    ) {
      problem('五维不符合世界书的天赋总和、等级分配或层级上限，请调整属性或等级');
    }
    for (const [label, list] of [
      ['技能', v.skills],
      ['装备', v.equip],
    ] as const) {
      if (new Set(list.map(entry => entry.name)).size !== list.length)
        problem(`伙伴${label}名称重复`);
    }
    const s = v.stairway;
    const e = Object.keys(s.elements).length,
      p = Object.keys(s.powers).length,
      l = Object.keys(s.laws).length;
    if (
      tier <= 3 &&
      (s.isOpen || e || p || l || s.godlyRank || s.godKingdom.name || s.godKingdom.description)
    )
      problem('等级1–12不可开启登神长阶');
    if (tier >= 4 && !s.isOpen) problem('第四层级起须配置登神长阶');
    if (tier === 4 && (e < 1 || e > 3 || p || l))
      problem('第四层级须配置1–3个要素，不可配置权能或法则');
    if (tier === 5 && (e || p !== 1 || l)) problem('第五层级须配置1个权能');
    if (tier === 6 && (e || p || l !== 1)) problem('第六层级须配置1个法则');
    if (tier === 7 && (e || p || l < 1 || !s.godlyRank)) problem('第七层级须配置法则和神位');
    if (tier < 7 && (s.godlyRank || s.godKingdom.name || s.godKingdom.description))
      problem('神位与神国仅限第七层级');
  });
export type PartnerDraft = z.infer<typeof PartnerDraftSchema>;

export function itemCost(draft: Pick<ItemDraft, 'category' | 'rarity' | 'quantity'>): number {
  // 沿用自定义项目的品质价格区间，固定取75%位置，编辑文字不会随机改价。
  const unit =
    draft.category === 'asset'
      ? calculateAssetCostByPosition(draft.rarity, 0.75)
      : calculateCostByPosition(draft.rarity, 0.75);
  return unit * (draft.category === 'item' ? draft.quantity : 1);
}
export const partnerCost = (level: number) => calculateDestinedCost(Math.ceil(level / 4));
export function toSelectedItem(input: ItemDraft): Equipment | Item | Asset | Skill {
  const d = ItemDraftSchema.parse(input);
  const common = { name: d.name, rarity: d.rarity as Rarity, cost: itemCost(d), isCustom: true };
  if (d.category === 'asset')
    return {
      ...common,
      类型: d.type,
      标签: d.tag,
      总空间: d.totalSpace,
      结算: d.settlement,
      描述: d.description,
      位置: d.location,
      内部资产: d.internalAssets,
      _隐藏: false,
    };
  return {
    ...common,
    type: d.type,
    tag: d.tag,
    effect: d.effect,
    description: d.description,
    ...(d.category === 'item' ? { quantity: d.quantity } : {}),
    ...(d.category === 'equipment' ? { position: d.position } : {}),
    ...(d.category === 'skill' ? { consume: d.consume } : {}),
  };
}
export function toSelectedPartner(input: PartnerDraft): Partner {
  const data = PartnerDraftSchema.parse(input);
  return {
    ...data,
    cost: partnerCost(data.level),
    lifeLevel: TIER_NAMES[Math.ceil(data.level / 4) - 1],
    isCustom: true,
  };
}

function parseResponse(raw: string): unknown {
  const clean = raw.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '').trim();
  const fenced = [...clean.matchAll(/```(?:json|yaml|yml)?\s*\n([\s\S]*?)```/g)];
  if (fenced.length > 1) throw new Error('回复包含多个数据块，请重新生成');
  try {
    return parseYaml(fenced[0]?.[1] ?? clean);
  } catch {
    throw new Error('回复格式不完整，请重新生成；可在接口设置中提高输出上限');
  }
}
export function parseItems(raw: string, counts: Partial<Record<Category, number>>): ItemDraft[] {
  const root = z.record(z.string(), z.unknown()).parse(parseResponse(raw));
  const requested = Object.keys(counts) as Category[];
  for (const key of Object.keys(root)) {
    if (
      !requested.includes(key as Category) &&
      (!Array.isArray(root[key]) || (root[key] as unknown[]).length)
    ) {
      throw new Error(`回复包含未请求的分类：${key}`);
    }
  }
  return requested.flatMap(category => {
    const values = z
      .array(z.record(z.string(), z.unknown()))
      .max(10)
      .parse(root[category] ?? []);
    if (values.length !== counts[category])
      throw new Error(
        `${CATEGORY_LABELS[category]}应为${counts[category]}项，实际收到${values.length}项`,
      );
    const drafts = values.map(value =>
      ItemDraftSchema.parse({
        ...value,
        effect: value.effect ?? {},
        id: crypto.randomUUID(),
        category,
      }),
    );
    if (new Set(drafts.map(d => d.name)).size !== drafts.length)
      throw new Error(`${CATEGORY_LABELS[category]}名称重复`);
    return drafts;
  });
}
export function parsePartner(raw: string, options: PartnerGenerationOptions): PartnerDraft {
  const { equipmentCount, level, skillCount } = PartnerGenerationSchema.parse(options);
  const root = z.object({ partner: z.record(z.string(), z.unknown()) }).parse(parseResponse(raw));
  const value = { ...root.partner };
  // 仅请求0项时容许模型省略空数组；正数量仍须完整返回并通过数量检查。
  if (skillCount === 0 && value.skills == null) value.skills = [];
  if (equipmentCount === 0 && value.equip == null) value.equip = [];
  const data = PartnerDraftSchema.parse(value);
  if (data.skills.length !== skillCount)
    throw new Error(`伙伴应有${skillCount}个技能，实际收到${data.skills.length}个`);
  if (data.equip.length !== equipmentCount)
    throw new Error(`伙伴应携带${equipmentCount}件装备，实际收到${data.equip.length}件`);
  if (data.level !== level) throw new Error(`伙伴应为${level}级，实际收到${data.level}级`);
  return data;
}
export function validationMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues
      .slice(0, 3)
      .map(i => `${i.path.join('.') || '内容'}：${i.message}`)
      .join('；');
  return error instanceof Error ? error.message : '操作失败，请检查输入后重试';
}
