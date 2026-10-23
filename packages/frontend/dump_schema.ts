import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import _ from 'lodash';
import { z } from 'zod';

// The shared schema uses the same z/_ globals as its Tavern host.
Object.assign(globalThis, { z, _ });
const { Schema } = await import('@destiny/game/schema');

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(frontendRoot, '.cache', 'schema.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(
  output,
  JSON.stringify(z.toJSONSchema(Schema, { io: 'input', reused: 'ref' }), null, 2) + '\n',
);
console.info(`[schema] ${output}`);
