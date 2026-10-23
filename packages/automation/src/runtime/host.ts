import type { MessageVariables } from '../types';

/** VARIABLE_UPDATE_ENDED has no message id argument; capture its current target once. */
export const captureUpdateTarget = (): number => getLastMessageId();
export const writeDate = (variables: MessageVariables, messageId: number): void => {
  insertOrAssignVariables({ date: variables.date }, { type: 'message', message_id: messageId });
};
export const deleteEventCache = (variables: MessageVariables, messageId: number): void => {
  _.unset(variables, 'date.event.cache');
  deleteVariable('date.event.cache', { type: 'message', message_id: messageId });
};
export const readPromptSource = (): MessageVariables =>
  getVariables({ type: 'message', message_id: -2 }) as MessageVariables;
export const consumeLevelPrompts = (): void => {
  // Preserve the host's existing policy: read previous (-2), consume current (-1).
  insertOrAssignVariables(
    { date: { levelUpCharacter: null, levelUpNpcs: null } },
    { type: 'message', message_id: -1 }
  );
};
export const readAchievementSource = (): MessageVariables =>
  getVariables({ type: 'message', message_id: -1 }) as MessageVariables;
