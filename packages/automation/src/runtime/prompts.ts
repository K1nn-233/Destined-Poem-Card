import { buildGameInfo } from '../prompts/game-info';
import { buildEventPrompts } from '../prompts/event-prompts';
import { buildLevelPrompts } from '../prompts/level-prompts';
import { readPromptSource, consumeLevelPrompts } from './host';
import { prepareDate } from './state';

export const injectAllPrompts = (): void => {
  const source = readPromptSource();
  const variables = { ...source, date: prepareDate(source.date) };
  const prompts = [
    ...buildGameInfo(variables),
    ...buildEventPrompts(variables),
    ...buildLevelPrompts(variables),
  ];
  if (prompts.length) injectPrompts(prompts);
  if (variables.date.levelUpCharacter || variables.date.levelUpNpcs) consumeLevelPrompts();
};
