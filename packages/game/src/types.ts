import type { infer as Infer } from "zod";
import type { Schema } from "./schema/index.ts";

export type GameData = Infer<typeof Schema>;
