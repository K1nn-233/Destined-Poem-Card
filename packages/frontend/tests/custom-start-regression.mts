import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
const repo = fileURLToPath(new URL('../', import.meta.url))
  .replaceAll('\\', '/')
  .replace(/\/$/, '');
const require = createRequire(repo + '/package.json');
const _ = require('lodash');
Object.assign(globalThis, {
  _,
  z: require('zod').z,
  YAML: require('yaml'),
  __APP_VERSION__: 'test',
  __DESTINY_ASSET_BASE__: 'https://example.invalid',
  fetch: async () => ({ ok: true, text: async () => '{}' }),
});
const importFile = (p: string) =>
  import(pathToFileURL(repo + '/src/apps/custom-start/core/' + p).href);
const c = await importFile('features/ai-forge/contracts.ts');
const s = await importFile('features/ai-forge/service.ts');
const commits = await importFile('features/ai-forge/commit.ts');
const settings = await importFile('features/ai-forge/settings.ts');
const { createPinia, setActivePinia } = require('pinia');
const { useCharacterStore } = await importFile('store/character.ts');
const exporter = await importFile('utils/data-exporter.ts');
let apiCalls = 0,
  config: any,
  response = '',
  currentRules: any[] = [],
  written: any;
Object.assign(globalThis, {
  getCharWorldbookNames: () => ({ primary: '测试世界书' }),
  getWorldbook: async () => currentRules,
  substitudeMacros: (value: string) => value,
  generateRaw: async (value: any) => {
    apiCalls++;
    config = value;
    return response;
  },
  getVariables: () => ({}),
  waitGlobalInitialized: async () => {},
  Mvu: {
    getMvuData: () => ({ stat_data: {} }),
    replaceMvuData: async (v: any) => {
      written = v;
    },
  },
});
function item(name = '风纹短刀', extra = {}) {
  return {
    name,
    rarity: 'common',
    type: '短刀',
    tag: ['攻击: 20'],
    effect: { 轻灵: '先攻检定+1' },
    description: '刀身刻着风纹。',
    ...extra,
  };
}
function skill(name = '风息', extra = {}) {
  return item(name, { type: '主动', consume: '动作: 10 MP', ...extra });
}
function partner() {
  return {
    name: '林间药师',
    level: 1,
    race: '人类',
    identity: ['药师'],
    career: ['炼金师'],
    personality: '沉静细致',
    like: '草木',
    app: '深棕短发',
    cloth: '亚麻长衣',
    backgroundInfo: '在村庄行医。',
    attributes: { strength: 5, dexterity: 5, constitution: 5, intelligence: 5, mind: 5 },
    skills: Array.from({ length: 5 }, (_, i) => skill('草药技' + i)),
    equip: [item()],
    stairway: { isOpen: false },
  };
}
function draft(category = 'equipment', extra = {}) {
  return c.ItemDraftSchema.parse({ id: 'test', category, ...item(), ...extra });
}
function store() {
  return useCharacterStore(createPinia());
}
const main = settings.ForgeSettingsSchema.parse({});
const options = { tier: 1, level: 1, equipmentCount: 1, skillCount: 5 };
const wb = await importFile('features/ai-forge/worldbook.ts');
const req = Object.fromEntries(
  c.CATEGORIES.map((key: string) => [key, { count: c.DEFAULT_COUNTS[key], requirement: '' }]),
);
const records: any[] = [];
async function test(name: string, fn: () => any) {
  apiCalls = 0;
  config = null;
  currentRules = [
    '技能装备道具生成规则',
    '品质效果限定',
    '核心数值表',
    '角色生成',
    '角色辅助指导',
  ].map(name => ({ name, content: '测试规则', enabled: true }));
  try {
    await fn();
    records.push({ name, passed: true });
  } catch (e) {
    records.push({ name, passed: false, error: String(e) });
  }
}
await test('默认数量2/2/0/4', () =>
  assert.deepEqual(c.DEFAULT_COUNTS, { equipment: 2, item: 2, asset: 0, skill: 4 }));
await test('四项总生成仅调用一次API且空资产为0', async () => {
  response = JSON.stringify({
    equipment: [item('刀'), item('弓')],
    item: [item('药'), item('绳')],
    asset: [],
    skill: [skill('甲'), skill('乙'), skill('丙'), skill('丁')],
  });
  const result = await s.generateItems({
    settings: main,
    context: '{}',
    budget: 1000,
    requirements: req,
    categories: c.CATEGORIES,
    id: 'one',
    isCurrent: () => true,
  });
  assert.equal(result.length, 8);
  assert.equal(apiCalls, 1);
  assert.equal(config.custom_api, undefined);
});
await test('单独技能生成仅请求指定分类且一次调用', async () => {
  response = JSON.stringify({ skill: [skill('甲'), skill('乙'), skill('丙'), skill('丁')] });
  assert.equal(
    (
      await s.generateItems({
        settings: main,
        context: '{}',
        budget: 1000,
        requirements: req,
        categories: ['skill'],
        id: 'one',
        isCurrent: () => true,
      })
    ).length,
    4,
  );
  assert.equal(apiCalls, 1);
});
await test('额外API固定openai及模型输出上限', async () => {
  await s.requestDraft(
    [],
    {
      ...main,
      apiMode: 'custom',
      apiUrl: 'https://example.invalid/v1',
      apiKey: 'fixture',
      model: 'test',
      maxTokens: 8192,
    },
    'x',
  );
  assert.equal(config.custom_api.source, 'openai');
  assert.equal(config.custom_api.max_tokens, 8192);
});
await test('缺少必要规则不调用API', async () => {
  currentRules = [];
  await assert.rejects(
    s.generateItems({
      settings: main,
      context: '',
      budget: 1000,
      requirements: req,
      categories: ['skill'],
      id: 'x',
      isCurrent: () => true,
    }),
    /缺少必要规则/,
  );
  assert.equal(apiCalls, 0);
});
await test('取消规则读取后不会发出请求', async () => {
  assert.equal(
    await s.generateItems({
      settings: main,
      context: '',
      budget: 1000,
      requirements: req,
      categories: ['skill'],
      id: 'x',
      isCurrent: () => false,
    }),
    null,
  );
  assert.equal(apiCalls, 0);
});
await test('请求返回后过期不解析不注入', async () => {
  let checks = 0;
  response = 'invalid';
  assert.equal(
    await s.generateItems({
      settings: main,
      context: '',
      budget: 1000,
      requirements: req,
      categories: ['skill'],
      id: 'x',
      isCurrent: () => ++checks === 1,
    }),
    null,
  );
  assert.equal(apiCalls, 1);
});
await test('数量为零禁止空请求', async () => {
  await assert.rejects(
    s.generateItems({
      settings: main,
      context: '',
      budget: 1,
      requirements: req,
      categories: ['asset'],
      id: 'x',
      isCurrent: () => true,
    }),
    /至少/,
  );
  assert.equal(apiCalls, 0);
});
await test('数量小数拒绝', async () => {
  await assert.rejects(
    s.generateItems({
      settings: main,
      context: '',
      budget: 1,
      requirements: { ...req, skill: { count: 1.2 } },
      categories: ['skill'],
      id: 'x',
      isCurrent: () => true,
    }),
    /整数/,
  );
});
await test('数量不符拒绝整批', () =>
  assert.throws(() => c.parseItems(JSON.stringify({ skill: [skill()] }), { skill: 4 }), /应为4项/));
await test('未请求分类不能混入', () =>
  assert.throws(
    () => c.parseItems(JSON.stringify({ skill: [skill()], equipment: [item()] }), { skill: 1 }),
    /未请求/,
  ));
await test('同分类重名拒绝', () =>
  assert.throws(
    () => c.parseItems(JSON.stringify({ skill: [skill(), skill()] }), { skill: 2 }),
    /重复/,
  ));
await test('支持YAML代码块', () =>
  assert.equal(
    c.parseItems('```yaml\nequipment:\n  - ' + JSON.stringify(item()) + '\n```', { equipment: 1 })
      .length,
    1,
  ));
await test('截断数据拒绝', () =>
  assert.throws(() => c.parseItems('{"skill":[', { skill: 1 }), /格式不完整/));
await test('未知品质拒绝', () => assert.throws(() => draft('equipment', { rarity: 'free' })));
await test('中文品质归一化', () =>
  assert.equal(draft('equipment', { rarity: '稀有' }).rarity, 'rare'));
await test('空效果拒绝', () => assert.throws(() => draft('equipment', { effect: {} })));
await test('主动技能无消耗拒绝', () =>
  assert.throws(() => draft('skill', { type: '主动', consume: '' })));
await test('模型报价不能覆盖本地价格', () =>
  assert.equal(c.toSelectedItem(draft('equipment', { cost: -999 })).cost, 24));
await test('改文字不变价，改品质重算', () => {
  const d = draft();
  assert.equal(c.itemCost(d), c.itemCost({ ...d, name: '新名' }));
  assert.equal(c.itemCost({ ...d, rarity: 'rare' }), 84);
});
await test('道具件数计入价格', () => assert.equal(c.itemCost(draft('item', { quantity: 3 })), 72));
await test('无内部组成资产支持完整映射', () => {
  const d = draft('asset', {
    totalSpace: '不适用',
    settlement: '无固定收支',
    location: '登记处',
    internalAssets: {},
    effect: {},
  });
  const data = c.toSelectedItem(d);
  assert.equal(data.位置, '登记处');
  assert.equal(data.cost, 160);
  assert.deepEqual(data.内部资产, {});
});
await test('内部资产嵌套信息保留', () => {
  const data = c.toSelectedItem(
    draft('asset', {
      totalSpace: '20m²',
      settlement: '无固定收支',
      location: '村庄',
      internalAssets: {
        炉子: {
          品质: '普通',
          标签: ['设施'],
          数量: 2,
          效果: { 锻造: '+1' },
          描述: '双炉',
          总占用空间: '4m²',
        },
      },
    }),
  );
  assert.equal(data.内部资产.炉子.数量, 2);
  assert.equal(data.内部资产.炉子.品质, 'common');
});
await test('整批超额无部分写入', () => {
  const st = store();
  st.character.reincarnationPoints = 30;
  assert.throws(() => commits.commitItems(st, [draft(), draft('item', { name: '药' })]), /不足/);
  assert.equal(st.selectedEquipments.length + st.selectedItems.length, 0);
});
await test('恰好预算可注入，输入草稿与已选独立', () => {
  const st = store();
  st.character.reincarnationPoints = 24;
  const d = draft();
  commits.commitItems(st, [d]);
  d.effect.轻灵 = '改动';
  assert.equal(st.consumedPoints, 24);
  assert.equal(st.selectedEquipments[0].effect.轻灵, '先攻检定+1');
});
await test('确认时采用最新余额', () => {
  const st = store();
  st.character.reincarnationPoints = 50;
  commits.prepareItems(st, [draft()]);
  st.character.money = 4000;
  assert.throws(() => commits.commitItems(st, [draft()]), /不足/);
  assert.equal(st.selectedEquipments.length, 0);
});
await test('重复注入同名拦截', () => {
  const st = store();
  commits.commitItems(st, [draft()]);
  assert.throws(() => commits.commitItems(st, [draft()]), /已存在/);
  assert.equal(st.selectedEquipments.length, 1);
});
await test('删除项目后可满足预算', () => {
  const st = store();
  st.character.reincarnationPoints = 24;
  const list = [draft(), draft('item', { name: '药' })];
  list.pop();
  commits.commitItems(st, list);
  assert.equal(st.selectedEquipments.length, 1);
});
await test('伙伴默认五技能可解析且价格按层级', () => {
  const p = c.parsePartner(JSON.stringify({ partner: partner() }), options);
  assert.equal(c.toSelectedPartner(p).cost, 100);
  assert.equal(p.skills.length, 5);
});
await test('伙伴不足五技能拒绝生成结果', () => {
  const p = partner();
  p.skills.pop();
  assert.throws(() => c.parsePartner(JSON.stringify({ partner: p }), options), /应有5个/);
});
await test('伙伴指定装备数量校验', () =>
  assert.throws(
    () => c.parsePartner(JSON.stringify({ partner: partner() }), { ...options, equipmentCount: 2 }),
    /应携带2/,
  ));
await test('伙伴五维守恒校验', () => {
  const p = partner();
  p.attributes.strength = 8;
  assert.throws(() => c.PartnerDraftSchema.parse(p), /五维/);
});
await test('低等级禁止登神长阶', () => {
  const p = partner();
  p.stairway.isOpen = true;
  assert.throws(() => c.PartnerDraftSchema.parse(p), /不可开启/);
});
await test('伙伴预览可以删减技能后确认', () => {
  const st = store();
  const p = c.PartnerDraftSchema.parse(partner());
  p.skills.pop();
  commits.commitPartner(st, p);
  assert.equal(st.selectedPartners[0].skills.length, 4);
  assert.equal(st.consumedPoints, 100);
});
await test('伙伴超额及重名拦截', () => {
  const st = store();
  const p = c.PartnerDraftSchema.parse(partner());
  st.character.reincarnationPoints = 99;
  assert.throws(() => commits.commitPartner(st, p), /不足/);
  st.character.reincarnationPoints = 1000;
  commits.commitPartner(st, p);
  assert.throws(() => commits.commitPartner(st, p), /已存在/);
  assert.equal(st.selectedPartners.length, 1);
});
await test('伙伴生成一次请求且指定数量写入提示词', async () => {
  response = JSON.stringify({ partner: partner() });
  assert.equal(
    (
      await s.generatePartner({
        settings: main,
        context: '',
        budget: 1000,
        description: '药师',
        options,
        id: 'p',
        isCurrent: () => true,
      })
    ).skills.length,
    5,
  );
  assert.equal(apiCalls, 1);
  assert.match(config.ordered_prompts.at(-1).content, /5个完整技能和1件完整装备/);
});
await test('密钥不进入生成提示词', () =>
  assert.equal(
    JSON.stringify(s.buildItemPrompts(currentRules, '{}', 1000, req, c.CATEGORIES)).includes(
      'fixture-secret',
    ),
    false,
  ));
await test('凭据式URL被拒绝', () =>
  assert.notEqual(
    s.apiProblem({
      ...main,
      apiMode: 'custom',
      apiUrl: 'https://user:pw@example.invalid',
      model: 'x',
    }),
    '',
  ));
await test('非有限预算禁止提交', () => {
  const st = store();
  st.character.reincarnationPoints = NaN;
  assert.throws(() => commits.commitItems(st, [draft()]), /不足/);
});
await test('四类及伙伴经原导出器保留字段，凭据不进入角色数据', async () => {
  const st = store();
  st.character.reincarnationPoints = 10000;
  commits.commitItems(st, [
    draft('equipment', { position: '主手' }),
    draft('item', { name: '药瓶', quantity: 3 }),
    draft('skill', { ...skill('防护') }),
    draft('asset', {
      name: '小屋',
      totalSpace: '20m²',
      settlement: '无固定收支',
      location: '村庄',
    }),
  ]);
  commits.commitPartner(st, c.PartnerDraftSchema.parse(partner()));
  await exporter.writeCharacterToMvu(
    st.character,
    st.selectedEquipments,
    st.selectedItems,
    st.selectedAssets,
    st.selectedSkills,
    st.selectedPartners,
  );
  assert.equal(written.stat_data.主角.装备.风纹短刀.位置, '主手');
  assert.equal(written.stat_data.主角.背包.药瓶.数量, 3);
  assert.equal(written.stat_data.主角.技能.防护.消耗, '动作: 10 MP');
  assert.equal(written.stat_data.主角.资产.小屋.位置, '村庄');
  assert.equal(Object.keys(written.stat_data.关系列表.林间药师.技能).length, 5);
  assert.equal(JSON.stringify(written).includes('apiKey'), false);
});
const extra = (title: string) => '[本体][额外设定]' + title;
const lore = '[本体][世界设定]世界主设定';
const race = '[本体][种族][智慧生物]精灵';
const regional = '[本体][地区]北方';
function completeRules() {
  return [
    ...currentRules.map(e => ({ ...e, name: extra(e.name) })),
    ...[
      extra('状态规则'),
      extra('经济价格指南'),
      extra('角色命名指导'),
      extra('好感度'),
      lore,
      '[本体][世界设定]世界规则',
      '[本体][世界设定]生命层级与社会阶级',
      '[本体][世界设定]登神长阶',
      '[本体][种族]种族概览',
      race,
      regional,
      '[DLC][种族]测试种族',
      extra('战斗协议'),
    ].map(name => ({ name, content: 'fixture lore' })),
  ];
}
await test('项目默认读取生成品质数值状态经济及世界约束', async () => {
  currentRules = completeRules();
  const names = wb.selectedEntryNames(main, currentRules, '测试世界书', 'items');
  assert.equal(names.length, 9);
  assert.ok(names.includes(extra('经济价格指南')));
  assert.ok(names.includes(lore));
  assert.ok(!names.includes(race));
  assert.ok(!names.includes(extra('战斗协议')));
  assert.deepEqual(
    (await s.readRules(main, 'items')).map(e => e.name),
    names,
  );
});
await test('伙伴默认包含角色命名世界大纲全部本体种族，不默认DLC', async () => {
  currentRules = completeRules();
  const names = wb.selectedEntryNames(main, currentRules, '测试世界书', 'partner');
  assert.ok([lore, race, extra('角色命名指导'), extra('好感度')].every(n => names.includes(n)));
  assert.ok(!names.includes('[DLC][种族]测试种族'));
  assert.deepEqual(
    (await s.readRules(main, 'partner')).map(e => e.name),
    names,
  );
});
await test('勾选列表与实际提示词一致：取消默认条目及补选地区', async () => {
  currentRules = completeRules();
  const local = settings.ForgeSettingsSchema.parse({});
  const chosen = wb.defaultEntryNames(currentRules, 'partner').filter(n => n !== lore);
  chosen.push(regional);
  wb.setEntrySelection(local, '测试世界书', 'partner', chosen);
  const sent = await s.readRules(local, 'partner');
  assert.deepEqual(new Set(sent.map(e => e.name)), new Set(chosen));
  const prompt = s.buildPartnerPrompts(sent, '{}', 1000, '药师', options);
  assert.ok(!prompt[1].content.includes(lore));
  assert.ok(prompt[1].content.includes(regional));
  assert.ok(wb.selectedEntryNames(local, currentRules, '测试世界书', 'items').includes(lore));
});
await test('世界书选择按书及模式隔离，保存重载保留取消选择', () => {
  currentRules = completeRules();
  const local = settings.ForgeSettingsSchema.parse({});
  wb.setEntrySelection(local, '测试世界书', 'partner', []);
  wb.setEntrySelection(local, '另一本书', 'partner', [lore]);
  const saved = settings.ForgeSettingsSchema.parse(JSON.parse(JSON.stringify(local)));
  assert.deepEqual(wb.selectedEntryNames(saved, currentRules, '测试世界书', 'partner'), []);
  assert.deepEqual(wb.selectedEntryNames(saved, currentRules, '另一本书', 'partner'), [lore]);
  assert.ok(wb.selectedEntryNames(saved, currentRules, '测试世界书', 'items').length > 0);
});
await test('旧版补选迁移可见，显式取消后不再偷偷附带', () => {
  currentRules = completeRules();
  const local = settings.ForgeSettingsSchema.parse({ extraEntries: [regional, '已删除条目'] });
  assert.ok(wb.selectedEntryNames(local, currentRules, '测试世界书', 'items').includes(regional));
  wb.setEntrySelection(local, '测试世界书', 'items', wb.defaultEntryNames(currentRules, 'items'));
  assert.ok(!wb.selectedEntryNames(local, currentRules, '测试世界书', 'items').includes(regional));
});
await test('空条目和纯EJS条目不进入默认勾选，不替换未选条目的宏', async () => {
  currentRules = completeRules();
  currentRules.push(
    { name: '[本体][种族]空', content: '' },
    { name: '[本体][种族]EJS', content: '<% arbitrary() %>' },
  );
  const substituted: string[] = [];
  const before = globalThis.substitudeMacros;
  globalThis.substitudeMacros = (v: string) => {
    substituted.push(v);
    return v;
  };
  try {
    const sent = await s.readRules(main, 'items');
    assert.equal(substituted.length, sent.length);
    assert.ok(!wb.defaultEntryNames(currentRules, 'partner').some(n => /空|EJS/.test(n)));
  } finally {
    globalThis.substitudeMacros = before;
  }
});
await test('取消必要规则时明确阻止调用，不会隐藏补回', async () => {
  const local = settings.ForgeSettingsSchema.parse({});
  wb.setEntrySelection(local, '测试世界书', 'items', []);
  await assert.rejects(
    s.generateItems({
      settings: local,
      context: '',
      budget: 1,
      requirements: req,
      categories: ['skill'],
      id: 'x',
      isCurrent: () => true,
    }),
    /尚未勾选/,
  );
  assert.equal(apiCalls, 0);
});
await test('实际仓库的默认勾选名称及正文可用，报告记录清单', async () => {
  const root = fileURLToPath(new URL('../../../worldbook/', import.meta.url));
  const yaml = require('yaml').parse(readFileSync(root + '命定之诗.yaml', 'utf8'));
  const candidates = new Set(
    wb.defaultEntryNames(
      yaml.条目.map(e => ({ name: e.名称, content: 'placeholder' })),
      'partner',
    ),
  );
  currentRules = yaml.条目
    .filter(e => candidates.has(e.名称) && !e.名称.includes('➡️'))
    .map(e => ({
      name: e.名称,
      content:
        e.内容 ??
        readFileSync(
          ['.txt', '.yaml'].map(ext => root + e.文件.replaceAll('\\', '/') + ext).find(existsSync)!,
          'utf8',
        ),
    }));
  const report: any = {};
  for (const mode of ['items', 'partner'] as const) {
    const rules = await s.readRules(main, mode);
    assert.deepEqual(
      new Set(rules.map(e => e.name)),
      new Set(wb.defaultEntryNames(currentRules, mode)),
    );
    assert.ok(rules.every(e => e.content.length));
    report[mode] = {
      names: rules.map(e => e.name),
      characters: rules.reduce((s, e) => s + e.content.length, 0),
    };
  }
  assert.ok(report.partner.names.includes('[本体][种族]种族概览'));
  assert.ok(report.partner.names.includes(race));
});
await test('层级等级对应范围且七层只有25级', () => {
  assert.deepEqual(c.levelsForTier(2), [5, 6, 7, 8]);
  assert.deepEqual(c.levelsForTier(7), [25]);
  assert.throws(() => c.PartnerGenerationSchema.parse({ ...options, tier: 2 }), /一致/);
});
await test('非法生成选项在请求前拦截', async () => {
  for (const patch of [
    { equipmentCount: -1 },
    { equipmentCount: 11 },
    { equipmentCount: 1.5 },
    { tier: 2, level: 4 },
  ]) {
    await assert.rejects(
      s.generatePartner({
        settings: main,
        context: '',
        budget: 1000,
        description: '药师',
        options: { ...options, ...patch },
        id: 'p',
        isCurrent: () => true,
      }),
    );
  }
  assert.equal(apiCalls, 0);
});
await test('指定等级与零装备进入提示词，契约可留给草稿调整', async () => {
  const chosen = { tier: 2, level: 6, equipmentCount: 0, skillCount: 5 };
  const p = {
    ...partner(),
    level: 6,
    isContract: true,
    equip: [],
    attributes: { strength: 7, dexterity: 7, constitution: 7, intelligence: 7, mind: 7 },
    comment: '不应注入',
  };
  response = JSON.stringify({ partner: p });
  const result = await s.generatePartner({
    settings: main,
    context: '',
    budget: 1000,
    description: '药师',
    options: chosen,
    id: 'p',
    isCurrent: () => true,
  });
  assert.equal(apiCalls, 1);
  assert.equal(result.level, 6);
  assert.equal(result.isContract, true);
  assert.equal(result.equip.length, 0);
  assert.equal(result.comment, undefined);
  assert.equal(c.toSelectedPartner(result).comment, undefined);
  assert.match(config.ordered_prompts.at(-1).content, /level必须为6/);
  assert.throws(() => c.parsePartner(response, { ...chosen, level: 5 }), /应为5级/);
});
await test('全部层级提示词中的示例数值与登神字段保持有效', () => {
  for (let tier = 1; tier <= 7; tier++) {
    const selected = { ...options, tier, level: c.levelsForTier(tier).at(-1) };
    const text = s.buildPartnerPrompts([], '', 10000, '冒险者', selected).at(-1).content;
    const example = JSON.parse(text.slice(text.lastIndexOf('\n') + 1)).partner;
    assert.equal(c.PartnerDraftSchema.parse(example).level, selected.level);
  }
});
await test('伙伴技能数量支持0、3、20且每次只有一个请求', async () => {
  for (const count of [0, 3, 20]) {
    const p = { ...partner(), skills: Array.from({ length: count }, (_, i) => skill('技能' + i)) };
    response = JSON.stringify({ partner: p });
    const before = apiCalls;
    const result = await s.generatePartner({
      settings: main,
      context: '',
      budget: 1000,
      description: '药师',
      options: { ...options, skillCount: count },
      id: 'p',
      isCurrent: () => true,
    });
    assert.equal(result.skills.length, count);
    assert.equal(apiCalls, before + 1);
    assert.ok(
      config.ordered_prompts.at(-1).content.includes(`本次指定${count}个完整技能和1件完整装备`),
    );
    if (!count) {
      const prompt = config.ordered_prompts.at(-1).content;
      assert.deepEqual(JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)).partner.skills, []);
    }
  }
});
await test('技能数量不符不接受草稿，不调用第二次API', async () => {
  response = JSON.stringify({ partner: partner() });
  await assert.rejects(
    s.generatePartner({
      settings: main,
      context: '',
      budget: 1000,
      description: '药师',
      options: { ...options, skillCount: 3 },
      id: 'p',
      isCurrent: () => true,
    }),
    /应有3个技能/,
  );
  assert.equal(apiCalls, 1);
});
await test('非法技能数量请求前拒绝', async () => {
  for (const skillCount of [-1, 21, 1.5, NaN]) {
    await assert.rejects(
      s.generatePartner({
        settings: main,
        context: '',
        budget: 1000,
        description: '药师',
        options: { ...options, skillCount },
        id: 'p',
        isCurrent: () => true,
      }),
    );
  }
  assert.equal(apiCalls, 0);
});
await test('技能数量默认5，非默认结果可正常注入且价格沿用层级', async () => {
  const { useForgeDrafts } = await importFile('features/ai-forge/drafts.store.ts');
  assert.equal(useForgeDrafts(createPinia()).partnerOptions.skillCount, 5);
  const p = { ...partner(), skills: [skill('甲'), skill('乙'), skill('丙')] };
  const parsed = c.parsePartner(JSON.stringify({ partner: p }), { ...options, skillCount: 3 });
  const st = store();
  commits.commitPartner(st, parsed);
  assert.equal(st.selectedPartners[0].skills.length, 3);
  assert.equal(st.consumedPoints, 100);
});
await test('默认只勾选数量大于0的分类，切换步骤保留勾选', async () => {
  const { useForgeDrafts } = await importFile('features/ai-forge/drafts.store.ts');
  const pinia = createPinia();
  const draftState = useForgeDrafts(pinia);
  assert.deepEqual(draftState.selectedCategories, ['equipment', 'item', 'skill']);
  draftState.selectedCategories = ['skill'];
  assert.deepEqual(useForgeDrafts(pinia).selectedCategories, ['skill']);
});
await test('只勾选技能时其余空数量或非法数量不阻断，要求可留空', async () => {
  const requirements = {
    equipment: { count: '', requirement: '' },
    item: { count: NaN, requirement: '' },
    asset: { count: -1, requirement: '' },
    skill: { count: 1, requirement: '  ' },
  };
  response = JSON.stringify({ skill: [skill()] });
  const result = await s.generateItems({
    settings: main,
    context: '{}',
    budget: 1000,
    requirements,
    categories: ['skill'],
    id: 'selected',
    isCurrent: () => true,
  });
  assert.equal(apiCalls, 1);
  assert.equal(result.length, 1);
  const prompt = config.ordered_prompts.at(-1).content;
  assert.ok(prompt.includes('结合角色背景自由设计'));
  assert.deepEqual(Object.keys(JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1))), ['skill']);
});
await test('勾选武器道具时一次请求只生成两类，不要求技能和资产返回', async () => {
  const requirements = _.cloneDeep(req);
  requirements.equipment.count = 1;
  requirements.item.count = 1;
  response = JSON.stringify({ equipment: [item('刀')], item: [item('药')] });
  const result = await s.generateItems({
    settings: main,
    context: '{}',
    budget: 1000,
    requirements,
    categories: ['equipment', 'item'],
    id: 'two',
    isCurrent: () => true,
  });
  assert.equal(apiCalls, 1);
  assert.deepEqual(
    result.map(d => d.category),
    ['equipment', 'item'],
  );
  const prompt = config.ordered_prompts.at(-1).content;
  assert.deepEqual(Object.keys(JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1))), [
    'equipment',
    'item',
  ]);
});
await test('勾选分类的0或清空数量被跳过，不要求模型返回空数组', async () => {
  for (const count of [0, '', null, undefined]) {
    const requirements = _.cloneDeep(req);
    requirements.equipment.count = count;
    requirements.skill.count = 1;
    response = JSON.stringify({ skill: [skill()] });
    const result = await s.generateItems({
      settings: main,
      context: '{}',
      budget: 1000,
      requirements,
      categories: ['equipment', 'asset', 'skill'],
      id: 'empty',
      isCurrent: () => true,
    });
    assert.deepEqual(
      result.map(d => d.category),
      ['skill'],
    );
  }
  assert.equal(apiCalls, 4);
});
await test('取消全部勾选或全部数量为空时不调用API，保留明确提示', async () => {
  await assert.rejects(
    s.generateItems({
      settings: main,
      context: '',
      budget: 1000,
      requirements: req,
      categories: [],
      id: 'none',
      isCurrent: () => true,
    }),
    /至少勾选/,
  );
  const requirements = Object.fromEntries(
    c.CATEGORIES.map(k => [k, { count: '', requirement: '' }]),
  );
  await assert.rejects(
    s.generateItems({
      settings: main,
      context: '',
      budget: 1000,
      requirements,
      categories: c.CATEGORIES,
      id: 'empty',
      isCurrent: () => true,
    }),
    /至少设置一项/,
  );
  assert.equal(apiCalls, 0);
});
await test('已勾选的负数、小数、超限与NaN仍在请求前拒绝', async () => {
  for (const count of [-1, 1.5, 11, NaN]) {
    const requirements = { ...req, skill: { count, requirement: '' } };
    await assert.rejects(
      s.generateItems({
        settings: main,
        context: '',
        budget: 1000,
        requirements,
        categories: ['skill'],
        id: 'bad',
        isCurrent: () => true,
      }),
      /0–10/,
    );
  }
  assert.equal(apiCalls, 0);
});
await test('有效数量已勾选时仍拒绝模型漏项，不能把不完整批次当成功', async () => {
  const requirements = _.cloneDeep(req);
  requirements.equipment.count = 1;
  requirements.skill.count = 1;
  response = JSON.stringify({ equipment: [item()] });
  await assert.rejects(
    s.generateItems({
      settings: main,
      context: '',
      budget: 1000,
      requirements,
      categories: ['equipment', 'skill'],
      id: 'missing',
      isCurrent: () => true,
    }),
    /技能应为1项/,
  );
  assert.equal(apiCalls, 1);
});
await test('伙伴可省略非必填喜爱，不影响正常生成与注入', async () => {
  const p = partner();
  delete p.like;
  response = JSON.stringify({ partner: p });
  const result = await s.generatePartner({
    settings: main,
    context: '',
    budget: 1000,
    description: '药师',
    options,
    id: 'p',
    isCurrent: () => true,
  });
  assert.equal(result.like, '');
  const st = store();
  commits.commitPartner(st, result);
  assert.equal(st.selectedPartners[0].like, '');
  assert.equal(apiCalls, 1);
});
await test('伙伴零技能零装备时兼容省略或null，仍只生成一次', async () => {
  for (const missing of [undefined, null]) {
    const p = { ...partner(), skills: missing, equip: missing, like: undefined };
    response = JSON.stringify({ partner: p });
    const result = await s.generatePartner({
      settings: main,
      context: '',
      budget: 1000,
      description: '无武装的药师',
      options: { ...options, skillCount: 0, equipmentCount: 0 },
      id: 'p',
      isCurrent: () => true,
    });
    assert.deepEqual(result.skills, []);
    assert.deepEqual(result.equip, []);
    assert.equal(c.toSelectedPartner(result).cost, 100);
  }
  assert.equal(apiCalls, 2);
});
await test('伙伴正数量时省略技能或装备仍拒绝，不自动补成空内容', () => {
  for (const key of ['skills', 'equip']) {
    const p = partner();
    delete p[key];
    assert.throws(() => c.parsePartner(JSON.stringify({ partner: p }), options));
  }
});
await test('伙伴选0项时模型多返回内容仍按数量拒绝', () => {
  assert.throws(
    () => c.parsePartner(JSON.stringify({ partner: partner() }), { ...options, skillCount: 0 }),
    /应有0个技能/,
  );
  assert.throws(
    () => c.parsePartner(JSON.stringify({ partner: partner() }), { ...options, equipmentCount: 0 }),
    /应携带0件装备/,
  );
});
await test('伙伴必填描述和核心字段继续校验，不被可选字段兼容绕过', async () => {
  await assert.rejects(
    s.generatePartner({
      settings: main,
      context: '',
      budget: 1000,
      description: '  ',
      options,
      id: 'p',
      isCurrent: () => true,
    }),
    /整体描述/,
  );
  assert.equal(apiCalls, 0);
  for (const key of ['name', 'race', 'attributes']) {
    const p = partner();
    delete p[key];
    assert.throws(() => c.parsePartner(JSON.stringify({ partner: p }), options));
  }
});
const output = {
  passed: records.filter(r => r.passed).length,
  failed: records.filter(r => !r.passed).length,
  tests: records,
};
console.log('REGRESSION_RESULT=' + JSON.stringify(output));
if (output.failed) process.exitCode = 1;
