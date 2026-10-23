import { start } from '../../src/runtime/start';

test('no listener is registered until MVU initialization resolves', async () => {
  let ready!: () => void;
  const initialized = new Promise<void>(resolve => {
    ready = resolve;
  });
  const on = jest.fn();
  Object.assign(globalThis, {
    waitGlobalInitialized: jest.fn(() => initialized),
    eventOn: on,
    Mvu: { events: { COMMAND_PARSED: 'command', VARIABLE_UPDATE_ENDED: 'updated' } },
    tavern_events: {
      GENERATION_AFTER_COMMANDS: 'generation',
      MESSAGE_SENT: 'sent',
      MESSAGE_UPDATED: 'edited',
      CHAT_CHANGED: 'chat',
    },
    getCharData: jest.fn(() => null),
    getButtonEvent: jest.fn(() => 'achievement'),
    toastr: { success: jest.fn() },
  });
  const pending = start();
  expect(on).not.toHaveBeenCalled();
  ready();
  await pending;
  expect(on.mock.calls.map(call => call[0])).toEqual([
    'command',
    'updated',
    'generation',
    'sent',
    'edited',
    'achievement',
    'chat',
  ]);
});
