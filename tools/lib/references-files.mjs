import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
export const ROOT = path.resolve(import.meta.dirname, "../..");
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const jsonText = (data) => JSON.stringify(data, null, 2) + "\n";
export async function readJSON(file) {
  return JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
}
