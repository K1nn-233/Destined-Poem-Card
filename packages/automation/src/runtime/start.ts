import { handleVariableUpdate } from './update';
import { handleCommandParsed } from './command-policy';
import { injectAllPrompts } from './prompts';
import { readAchievementSource } from './host';
import { achievement } from '../services/achievement';
import { errorCatched } from '../utils';
import { checkWorldbookVersion } from './worldbook-check';

export const start = async (): Promise<void> => {
  await waitGlobalInitialized('Mvu');
  eventOn(Mvu.events.COMMAND_PARSED, errorCatched(handleCommandParsed));
  eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, errorCatched(handleVariableUpdate));
  eventOn(tavern_events.GENERATION_AFTER_COMMANDS, errorCatched(injectAllPrompts));
  eventOn(tavern_events.MESSAGE_SENT, errorCatched(injectAllPrompts));
  eventOn(tavern_events.MESSAGE_UPDATED, errorCatched(injectAllPrompts));
  eventOn(getButtonEvent('查看成就'), () => achievement(readAchievementSource()));
  eventOn(tavern_events.CHAT_CHANGED, () => void checkWorldbookVersion());
  void checkWorldbookVersion();
  console.log("[命定之诗] 脚本已加载 ฅ'ω'ฅ");
  toastr.success("[命定之诗] 脚本已加载 ฅ'ω'ฅ");
};
