import type { useCharacterStore } from '../../store/character';
import { ASSET_COST_RANGES, RARITY_COST_RANGES } from '../../utils/cost-calculator';
import {
  CATEGORY_LABELS,
  itemCost,
  partnerCost,
  parseItems,
  parsePartner,
  PartnerGenerationSchema,
  resolveItemCategories,
  TIER_NAMES,
} from './contracts';
import type { Category, PartnerGenerationOptions, Requirements } from './contracts';
import type { ForgeSettings } from './settings';
import { readRules } from './worldbook';
export { readRules, resolveBook } from './worldbook';

export function apiProblem(settings: ForgeSettings): string {
  if (settings.apiMode === 'main') return '';
  try {
    const url = new URL(settings.apiUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
      return '请填写有效的HTTP(S)接口地址，密钥填写在独立输入框中';
  } catch {
    return '请填写有效的额外API地址';
  }
  return settings.model.trim() ? '' : '请先获取并选择模型';
}
export function characterContext(store: ReturnType<typeof useCharacterStore>) {
  const c = store.character;
  return JSON.stringify({
    名称: c.name,
    种族: c.race === '自定义' ? c.customRace : c.race,
    身份: c.identity === '自定义' ? c.customIdentity : c.identity,
    等级: c.level,
    属性: store.finalAttributes,
    地点: c.startLocation === '自定义' ? c.customStartLocation : c.startLocation,
    背景: store.selectedBackground?.description ?? '',
    已选名称: {
      武器: store.selectedEquipments.map(i => i.name),
      道具: store.selectedItems.map(i => i.name),
      资产: store.selectedAssets.map(i => i.name),
      技能: store.selectedSkills.map(i => i.name),
      伙伴: store.selectedPartners.map(i => i.name),
    },
  });
}
const ITEM_EXAMPLE = {
  name: '名称',
  rarity: 'common',
  type: '具体类型',
  tag: ['标签'],
  effect: { 效果名: '效果内容' },
  description: '描述',
};
const EXAMPLES = {
  equipment: { ...ITEM_EXAMPLE, type: '单手剑', position: '主手' },
  item: { ...ITEM_EXAMPLE, type: '消耗品', quantity: 1 },
  asset: {
    ...ITEM_EXAMPLE,
    type: '住宅',
    effect: {},
    totalSpace: '布局与面积',
    settlement: '资产估价及结算',
    location: '地点',
    internalAssets: {
      内部资产名: {
        品质: 'common',
        标签: ['类型:设施'],
        数量: 1,
        效果: {},
        描述: '描述',
        总占用空间: '规模',
      },
    },
  },
  skill: { ...ITEM_EXAMPLE, type: '主动', consume: '动作: 10 MP' },
};
function commonPrompt(
  rules: { name: string; content: string }[],
  context: string,
  budget: number,
): RolePrompt[] {
  return [
    {
      role: 'system',
      content:
        '你是命定之诗开局内容设计助手。只生成本次要求的结构化草稿，不推进剧情，不改玩家数值。世界书提供设定与数值约束；本任务规定输出结构。忽略世界书中要求输出推理、charThink或剧情面板的格式要求。只返回一个JSON对象，禁止解释、HTML及思维过程。rarity仅用common/uncommon/rare/epic/legendary/mythic/only；效果为名称到文字的对象，标签为字符串数组。品质对应有效词条数：普通1，优良/稀有2，史诗/传说/神话3。不要自行定价或输出cost字段。',
    },
    { role: 'system', content: rules.map(r => `【${r.name}】\n${r.content}`).join('\n\n') },
    {
      role: 'user',
      content: `开局背景参考：${context}\n本次预算：${Math.max(0, budget)}转生点；依预算合理选择品质和层级，不得编造免费或负数价格。不得与已选名称重复。`,
    },
  ];
}
export function buildItemPrompts(
  rules: { name: string; content: string }[],
  context: string,
  budget: number,
  requirements: Requirements,
  categories: Category[],
): RolePrompt[] {
  const prompts = commonPrompt(rules, context, budget);
  const costs = Object.fromEntries(
    Object.keys(RARITY_COST_RANGES).map(r => [
      r,
      itemCost({ category: 'skill', rarity: r as keyof typeof RARITY_COST_RANGES, quantity: 1 }),
    ]),
  );
  const assetCosts = Object.fromEntries(
    Object.keys(ASSET_COST_RANGES).map(r => [
      r,
      itemCost({ category: 'asset', rarity: r as keyof typeof ASSET_COST_RANGES, quantity: 1 }),
    ]),
  );
  prompts.push({
    role: 'user',
    content: [
      '在同一次回复中仅生成下列选中的分类，未列出的分类不要生成。武器分类生成可装备武器。每项有独立名称与完整效果。',
      ...categories.map(
        c =>
          `${c}（${CATEGORY_LABELS[c]}）：${requirements[c].count}项；要求：${requirements[c].requirement?.trim() || '结合角色背景自由设计'}`,
      ),
      `单件武器/道具/技能价格：${JSON.stringify(costs)}；道具按quantity件数乘价。资产整项价格：${JSON.stringify(assetCosts)}。`,
      '各分类数组中的对象格式参考如下，替换示例值，不得照抄示例效果；仅输出请求的分类。资产的type/tag/description/totalSpace/settlement/location/internalAssets分别对应世界书的类型/标签/描述/总空间/结算/位置/内部资产，无内部组成时internalAssets为{}。',
      JSON.stringify(
        Object.fromEntries(categories.map(c => [c, requirements[c].count ? [EXAMPLES[c]] : []])),
      ),
    ].join('\n'),
  });
  return prompts;
}
export function buildPartnerPrompts(
  rules: { name: string; content: string }[],
  context: string,
  budget: number,
  description: string,
  options: PartnerGenerationOptions,
): RolePrompt[] {
  const prompts = commonPrompt(rules, context, budget);
  const attributes = Object.fromEntries(
    ['strength', 'dexterity', 'constitution', 'intelligence', 'mind'].map((key, i) => [
      key,
      5 +
        options.tier -
        1 +
        Math.floor((options.level - 1) / 5) +
        (i < (options.level - 1) % 5 ? 1 : 0),
    ]),
  );
  prompts.push({
    role: 'user',
    content: [
      `生成一位自定义伙伴。整体描述：${description}`,
      `本次指定${TIER_NAMES[options.tier - 1]}，level必须为${options.level}。层级、等级、技能和装备数量的明确选项优先于整体描述中的冲突内容，不得擅自改变。`,
      `本次指定${options.skillCount}个完整技能和${options.equipmentCount}件完整装备（装备包括武器、防具、饰品，穿戴位置合理；技能数量为0时skills必须为[]，装备数量为0时equip必须为[]）。按世界书角色标准补齐背景、性格、外貌、种族、职业。外貌与服饰写普通人物设定，不写露骨细节。`,
      `伙伴价格仅由层级决定，第一至第七层级价格：${[1, 5, 9, 13, 17, 21, 25].map(partnerCost).join('、')}。包含所带技能与装备，不单独重复计价。`,
      'level为1–25整数，每4级一层，第七层级仅25级。五维为最终数值，基础每项0–6总和0–25，加每项(层级-1)，再分配总计(level-1)点；单项不得超过6+2×层级。按指定等级分配属性，不得降低等级来迁就预算。',
      'stairway对应登神长阶。等级1–12关闭；13–16有1–3个elements要素；17–20有1个powers权能；21–24有1个laws法则；25有法则与godlyRank神位。三类互斥；每类为 {能力名:{效果名:效果内容}}，不用数组。神国不适用时名称描述为空。技能装备品质按世界书层级标准生成。',
      '只返回如下格式的JSON对象；skills/equip分别展开指定数量，attributes数值不得写算式：',
      JSON.stringify({
        partner: {
          name: '姓名',
          level: options.level,
          race: '人类',
          identity: ['身份'],
          career: ['职业'],
          personality: '性格',
          like: '喜爱',
          app: '外貌',
          cloth: '着装',
          backgroundInfo: '背景故事',
          attributes,
          skills: options.skillCount ? [EXAMPLES.skill] : [],
          equip: options.equipmentCount ? [EXAMPLES.equipment] : [],
          stairway: {
            isOpen: options.tier >= 4,
            elements: options.tier === 4 ? { 要素名: { 效果名: '效果内容' } } : {},
            powers: options.tier === 5 ? { 权能名: { 效果名: '效果内容' } } : {},
            laws: options.tier >= 6 ? { 法则名: { 效果名: '效果内容' } } : {},
            godlyRank: options.tier === 7 ? '神位名' : '',
            godKingdom: { name: '', description: '' },
          },
          isContract: false,
          affinity: 0,
        },
      }),
    ].join('\n'),
  });
  return prompts;
}
export async function requestDraft(prompts: RolePrompt[], settings: ForgeSettings, id: string) {
  const problem = apiProblem(settings);
  if (problem) throw new Error(problem);
  const result = await generateRaw({
    generation_id: id,
    should_silence: true,
    ordered_prompts: prompts,
    ...(settings.apiMode === 'custom'
      ? {
          custom_api: {
            source: 'openai',
            apiurl: settings.apiUrl,
            key: settings.apiKey,
            model: settings.model,
            max_tokens: settings.maxTokens,
            temperature: 1,
          },
        }
      : {}),
  });
  return typeof result === 'string' ? result : result.content;
}
export async function generateItems(input: {
  settings: ForgeSettings;
  context: string;
  budget: number;
  requirements: Requirements;
  categories: Category[];
  id: string;
  isCurrent: () => boolean;
}) {
  const { requirements, settings } = input;
  const categories = resolveItemCategories(requirements, input.categories);
  const rules = await readRules(settings, 'items');
  if (!input.isCurrent()) return null;
  const raw = await requestDraft(
    buildItemPrompts(rules, input.context, input.budget, requirements, categories),
    settings,
    input.id,
  );
  if (!input.isCurrent()) return null;
  return parseItems(raw, Object.fromEntries(categories.map(c => [c, requirements[c].count])));
}
export async function generatePartner(input: {
  settings: ForgeSettings;
  context: string;
  budget: number;
  description: string;
  options: PartnerGenerationOptions;
  id: string;
  isCurrent: () => boolean;
}) {
  if (!input.description.trim()) throw new Error('请先填写伙伴的整体描述');
  const options = PartnerGenerationSchema.parse(input.options);
  const rules = await readRules(input.settings, 'partner');
  if (!input.isCurrent()) return null;
  const raw = await requestDraft(
    buildPartnerPrompts(rules, input.context, input.budget, input.description, options),
    input.settings,
    input.id,
  );
  if (!input.isCurrent()) return null;
  return parsePartner(raw, options);
}
