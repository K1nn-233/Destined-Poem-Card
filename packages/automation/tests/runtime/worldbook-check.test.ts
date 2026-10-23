import { decideWorldbookCheck, VERSION_ENTRY_NAME } from '../../src/runtime/worldbook-check';

const marker = (content: string) => ({ name: VERSION_ENTRY_NAME, content });
const base = { cardVersion: 'V4.3.4', worldbook: '命定之诗与黄昏之歌v4.3', hasEmbeddedBook: true };

test('same version needs nothing', () => {
  expect(decideWorldbookCheck({ ...base, bookEntries: [marker('V4.3.4')] })).toEqual({ action: 'none' });
});

test('older or unmarked worldbook prompts an update', () => {
  expect(decideWorldbookCheck({ ...base, bookEntries: [marker('V4.3.3')] })).toMatchObject({
    action: 'prompt',
    bookVersion: 'V4.3.3',
  });
  expect(decideWorldbookCheck({ ...base, bookEntries: [{ name: '别的条目', content: '' }] })).toMatchObject({
    action: 'prompt',
    bookVersion: null,
  });
});

test('missing pieces are left to the host', () => {
  expect(decideWorldbookCheck({ ...base, worldbook: null, bookEntries: [] })).toEqual({ action: 'none' });
  expect(decideWorldbookCheck({ ...base, bookEntries: null })).toEqual({ action: 'none' });
  expect(decideWorldbookCheck({ ...base, hasEmbeddedBook: false, bookEntries: [] })).toEqual({ action: 'none' });
  expect(decideWorldbookCheck({ ...base, cardVersion: undefined, bookEntries: [] })).toEqual({ action: 'none' });
});
