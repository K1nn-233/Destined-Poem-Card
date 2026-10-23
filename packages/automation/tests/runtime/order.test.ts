import { handleVariableUpdate } from '../../src/runtime/update';
import { buildVariables } from '../helpers';

const mockOrder: string[] = [];
jest.mock('@destiny/game/schema', () => ({
  Schema: {
    safeParse: (value: unknown) => {
      mockOrder.push('schema');
      return { success: true, data: value };
    },
  },
}));
jest.mock('../../src/services/maintain', () => ({
  maintainCharacterData: () => mockOrder.push('maintain'),
}));
jest.mock('../../src/services/experience', () => ({
  processExperienceAndLevel: () => mockOrder.push('player-exp'),
}));
jest.mock('../../src/services/npc-experience', () => ({
  processNPCExperienceAndLevel: () => mockOrder.push('npc-exp'),
}));
jest.mock('../../src/services/resource-calculator', () => ({
  calculateResourceLimits: () => mockOrder.push('resource'),
}));
jest.mock('../../src/services/event', () => ({
  processEvent: () => {
    mockOrder.push('event');
    return true;
  },
}));
jest.mock('../../src/services/log', () => ({
  DefaultLogData: {},
  logSystem: () => mockOrder.push('log'),
}));

test('preserves the lifecycle and makes each stage date write visible before the next', () => {
  mockOrder.length = 0;
  Object.assign(globalThis, {
    getLastMessageId: jest.fn(() => 10),
    deleteVariable: jest.fn(() => mockOrder.push('delete-event')),
  });
  (insertOrAssignVariables as jest.Mock).mockImplementation(() => mockOrder.push('write'));
  (uninjectPrompts as jest.Mock).mockImplementation(() => mockOrder.push('uninject'));
  handleVariableUpdate(
    buildVariables() as unknown as Mvu.MvuData,
    buildVariables() as unknown as Mvu.MvuData
  );
  expect(mockOrder).toEqual([
    'schema',
    'write',
    'uninject',
    'maintain',
    'write',
    'player-exp',
    'write',
    'npc-exp',
    'write',
    'resource',
    'event',
    'write',
    'log',
    'write',
    'delete-event',
  ]);
});
