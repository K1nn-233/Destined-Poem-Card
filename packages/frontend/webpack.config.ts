import { createConfiguration } from '../../build/frontend/config.ts';
import { createEntries } from '../../build/frontend/entries.ts';

export default (env: { entry?: string } = {}, argv: { mode?: string }) =>
  createEntries(env.entry).map(entry => createConfiguration(entry, argv));
