import type { ForgeSettings } from './settings';

export type ForgeMode = 'items' | 'partner';
export type RuleEntry = { name: string; content: string };
const BASE_RULES = ['技能装备道具生成规则', '品质效果限定', '核心数值表'];
const ITEM_RULES = [...BASE_RULES, '状态规则', '经济价格指南'];
const PARTNER_RULES = ['角色生成', '角色辅助指导', '角色命名指导', '好感度'];
const WORLD_RULES = ['世界规则', '世界主设定', '生命层级与社会阶级', '登神长阶'];

// 只提取静态参考正文，不执行世界书中的 EJS。
export const staticContent = (content: string) => content.replace(/<%[\s\S]*?%>/g, '').trim();
export const usableEntries = (entries: RuleEntry[]) =>
  entries.filter(e => e.name.trim() && staticContent(e.content));
function matches(name: string, prefix: string, titles: string[]) {
  return titles.some(title => name === `${prefix}${title}` || name === title);
}
export function defaultEntryNames(entries: RuleEntry[], mode: ForgeMode): string[] {
  return usableEntries(entries)
    .filter(
      e =>
        matches(e.name, '[本体][额外设定]', ITEM_RULES) ||
        matches(e.name, '[本体][世界设定]', WORLD_RULES) ||
        (mode === 'partner' &&
          (matches(e.name, '[本体][额外设定]', PARTNER_RULES) ||
            e.name.startsWith('[本体][种族]'))),
    )
    .map(e => e.name);
}
export function selectedEntryNames(
  settings: ForgeSettings,
  entries: RuleEntry[],
  book: string,
  mode: ForgeMode,
): string[] {
  const saved = Object.hasOwn(settings.entrySelections, book)
    ? settings.entrySelections[book][mode]
    : undefined;
  // 兼容上一版补选内容；一旦用户修改，严格使用可见的显式勾选列表。
  const names = saved ?? [...defaultEntryNames(entries, mode), ...settings.extraEntries];
  const available = new Set(usableEntries(entries).map(e => e.name));
  return [...new Set(names)].filter(name => available.has(name));
}
export function setEntrySelection(
  settings: ForgeSettings,
  book: string,
  mode: ForgeMode,
  names: string[],
) {
  const previous = Object.hasOwn(settings.entrySelections, book)
    ? settings.entrySelections[book]
    : {};
  settings.entrySelections = {
    ...settings.entrySelections,
    [book]: { ...previous, [mode]: [...new Set(names)] },
  };
}
export function resolveBook(settings: ForgeSettings): string {
  const book = settings.worldbookName || getCharWorldbookNames('current').primary;
  if (!book) throw new Error('未找到主世界书，请在推演设置中选择世界书');
  return book;
}
export async function readRules(settings: ForgeSettings, mode: ForgeMode) {
  const book = resolveBook(settings);
  const entries = await getWorldbook(book);
  const selected = new Set(selectedEntryNames(settings, entries, book, mode));
  const rules = entries
    .filter(e => selected.has(e.name))
    .map(e => ({ name: e.name, content: substitudeMacros(staticContent(e.content)).trim() }));
  const empty = rules.filter(e => !e.content);
  if (empty.length)
    throw new Error(`以下已选条目没有可读取的正文：${empty.map(e => e.name).join('、')}`);
  const required = [...BASE_RULES, ...(mode === 'partner' ? ['角色生成', '角色辅助指导'] : [])];
  const missing = required.filter(
    key => !rules.some(e => matches(e.name, '[本体][额外设定]', [key])),
  );
  if (missing.length)
    throw new Error(`世界书缺少必要规则或尚未勾选：${missing.join('、')}。请在推演设置中检查`);
  return rules;
}
