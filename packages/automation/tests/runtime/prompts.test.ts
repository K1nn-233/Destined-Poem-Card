import { injectAllPrompts } from '../../src/runtime/prompts';
import { buildLevelPrompts } from '../../src/prompts/level-prompts';
import { prepareDate } from '../../src/runtime/state';
import { buildVariables } from '../helpers';

test('prompt builders only generate content; runtime reads -2 and consumes -1 after injection', () => {
  const variables = buildVariables({
    date: { levelUpCharacter: ['升级'], levelUpNpcs: ['NPC升级'] },
  });
  const read = jest.fn(() => variables);
  Object.assign(globalThis, { getVariables: read });
  expect(buildLevelPrompts(variables).map(prompt => prompt.id)).toEqual([
    '等级提升',
    'NPC等级提升',
  ]);
  expect(insertOrAssignVariables).not.toHaveBeenCalled();
  injectAllPrompts();
  expect(read).toHaveBeenCalledWith({ type: 'message', message_id: -2 });
  expect(insertOrAssignVariables).toHaveBeenCalledWith(
    { date: { levelUpCharacter: null, levelUpNpcs: null } },
    { type: 'message', message_id: -1 }
  );
  expect((injectPrompts as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    (insertOrAssignVariables as jest.Mock).mock.invocationCallOrder[0]
  );
  expect(variables.date.levelUpCharacter).toEqual(['升级']);
});

test('date preparation retains false settings and creates independent nested defaults', () => {
  const first = prepareDate({ requiresContractForExp: false });
  first.log.illegalLevelUpId.push(9);
  expect(first.requiresContractForExp).toBe(false);
  expect(prepareDate(undefined).log.illegalLevelUpId).toEqual([]);
});
