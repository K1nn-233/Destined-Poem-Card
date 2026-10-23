import { registerMvuSchema } from '@tavern-host/mvu-zod';

import { Schema } from '@destiny/game/schema';

$(() => {
  registerMvuSchema(Schema);
});
