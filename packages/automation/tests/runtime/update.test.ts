import { handleVariableUpdate } from '../../src/runtime/update';
import { buildVariables } from '../helpers';

const mvu = (value: unknown) => value as Mvu.MvuData;

test('one captured message receives all writes; maintenance log survives final log and cache deletion', () => {
  const old = buildVariables({ stat_data: { 主角: { 等级: 1, 累计经验值: 0, 金钱: 10 } } });
  const current = buildVariables({
    stat_data: {
      主角: { 等级: 9, 累计经验值: 0, 金钱: -20 },
      事件: { 开启: true, 结束: true, 标题: '测试事件', 阶段: '终章', 已完成事件: [] },
    },
  });
  const target = jest.fn().mockReturnValueOnce(7).mockReturnValue(99);
  const remove = jest.fn();
  const writes: unknown[] = [];
  Object.assign(globalThis, {
    getLastMessageId: target,
    deleteVariable: remove,
    toastr: { warning: jest.fn() },
  });
  (insertOrAssignVariables as jest.Mock).mockImplementation((value, options) => {
    writes.push({ value: _.cloneDeep(value), options });
  });
  handleVariableUpdate(mvu(current), mvu(old));
  expect(target).toHaveBeenCalledTimes(1);
  expect(current.stat_data.主角.等级).toBe(1);
  expect(current.date.log.illegalLevelUpId).toEqual([7]);
  expect(current.date.log.bankruptcyCount).toBe(1);
  expect(current.date.log.maxCurrencyDebt).toBe(20);
  expect(current.stat_data.事件.已完成事件).toEqual(['已完成事件测试事件']);
  expect(current.date.event.cache).toBeUndefined();
  expect(writes.length).toBeGreaterThan(1);
  for (const write of writes as any[])
    expect(write.options).toEqual({ type: 'message', message_id: 7 });
  expect(remove).toHaveBeenCalledWith('date.event.cache', { type: 'message', message_id: 7 });
  expect((insertOrAssignVariables as jest.Mock).mock.invocationCallOrder.at(-1)).toBeLessThan(
    remove.mock.invocationCallOrder[0]
  );
});

test('player growth is visible to resource and date persistence in the same update', () => {
  Object.assign(globalThis, {
    getLastMessageId: jest.fn(() => 7),
    deleteVariable: jest.fn(),
    toastr: { warning: jest.fn() },
  });
  const old = buildVariables({ stat_data: { 主角: { 等级: 4 } } });
  const current = buildVariables({
    stat_data: {
      主角: {
        等级: 4,
        累计经验值: 1200,
        属性: { 力量: 1, 敏捷: 1, 体质: 1, 智力: 1, 精神: 1 },
      },
    },
  });
  handleVariableUpdate(mvu(current), mvu(old));
  expect(current.stat_data.主角.等级).toBe(5);
  expect(current.stat_data.主角.属性.体质).toBe(2);
  expect(current.stat_data.主角.生命值.上限._基础).toBe(410);
  expect(current.date.levelUpCharacter?.join('')).toContain('4级提升到了5级');
  expect(
    (insertOrAssignVariables as jest.Mock).mock.calls.at(-1)?.[0].date.levelUpCharacter
  ).toEqual(current.date.levelUpCharacter);
});
