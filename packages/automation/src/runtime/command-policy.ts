// COMMAND_PARSED receives normalized MVU paths; policy intentionally matches exact paths.
type PolicyCommandType = Mvu.CommandInfo['type'] | 'keyed_insert' | 'keyed_delete';
type PolicyCommandInfo = { type: PolicyCommandType; path: string };

const commandPolicies: Record<string, readonly PolicyCommandType[]> = {
  'stat_data.事件.信号': ['set', 'add', 'delete', 'move', 'keyed_insert', 'keyed_delete'],
};

/**
 * COMMAND_PARSED 时 key 仍是字面量（如 `'信号'`），策略路径使用实际 key。
 * 这里只移除最外层引号，不解析转义或复杂路径；当前策略 key 均为简单字段。
 */
const getCommandKey = (key: string): string => key.replace(/^['"]|['"]$/g, '');

const getPolicyCommandInfo = (command: Mvu.CommandInfo): PolicyCommandInfo[] => {
  if (command.type === 'move') {
    return command.args.map(path => ({ type: 'move', path }));
  }
  if (command.type === 'insert' && command.args.length === 3) {
    const [parentPath, key] = command.args;
    return [
      { type: 'insert', path: parentPath },
      {
        type: 'keyed_insert',
        path: `${parentPath}.${getCommandKey(key)}`,
      },
    ];
  }
  if (command.type === 'delete' && command.args.length === 2) {
    const [parentPath, key] = command.args;
    return [
      { type: 'delete', path: parentPath },
      {
        type: 'keyed_delete',
        path: `${parentPath}.${getCommandKey(key)}`,
      },
    ];
  }
  return [{ type: command.type, path: command.args[0] }];
};

export const shouldExcludeCommand = (command: Mvu.CommandInfo): boolean =>
  getPolicyCommandInfo(command).some(
    ({ type, path }) => commandPolicies[path]?.includes(type) ?? false
  );

export const handleCommandParsed = (_variables: Mvu.MvuData, commands: Mvu.CommandInfo[]): void => {
  const retainedCommands = commands.filter(command => !shouldExcludeCommand(command));
  commands.splice(0, commands.length, ...retainedCommands);
};
