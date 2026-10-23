import { shouldExcludeCommand, handleCommandParsed } from '../../src/runtime/command-policy';

const command = (type: string, args: string[]): Mvu.CommandInfo =>
  ({ type, args, full_match: '' }) as Mvu.CommandInfo;

describe('normalized MVU command policy', () => {
  test.each([
    ['set', ['stat_data.事件.信号', 'true']],
    ['add', ['stat_data.事件.信号', '1']],
    ['delete', ['stat_data.事件.信号']],
    ['insert', ['stat_data.事件', "'信号'", 'true']],
    ['delete', ['stat_data.事件', '"信号"']],
    ['move', ['stat_data.事件.信号', 'other']],
    ['move', ['other', 'stat_data.事件.信号']],
  ])('excludes %s targeting the protected field', (type, args) => {
    expect(shouldExcludeCommand(command(type as string, args as string[]))).toBe(true);
  });
  test('keeps exact-match semantics and mutates the original command list', () => {
    const parent = command('set', ['stat_data.事件', '{}']);
    const child = command('set', ['stat_data.事件.信号.child', '1']);
    const commands = [parent, command('set', ['stat_data.事件.信号', 'true']), child];
    handleCommandParsed({} as Mvu.MvuData, commands);
    expect(commands).toEqual([parent, child]);
  });
});
