import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const frontendRoot = fileURLToPath(
  new URL("../../packages/frontend/", import.meta.url),
);
export interface Entry {
  name: string;
  script: string;
  directory: string;
  tsconfig: string;
  html?: string;
}

const entryScripts = {
  home: "apps/home/index.ts",
  custom_start: "apps/custom-start/index.ts",
  status: "apps/status/index.tsx",
  data_schema: "scripts/mvu-schema/index.ts",
  image_preload: "scripts/image-preload/index.ts",
};

export function createEntries(filter?: string): Entry[] {
  if (filter && !(filter in entryScripts))
    throw new Error(`Unknown frontend entry: ${filter}`);
  return Object.entries(entryScripts)
    .filter(([name]) => !filter || name === filter)
    .map(([name, relative]) => {
      const script = path.join(frontendRoot, "src", relative);
      const directory = path.dirname(script);
      const html = path.join(directory, "index.html");
      return {
        name,
        script,
        directory,
        tsconfig: path.join(directory, "tsconfig.json"),
        ...(fs.existsSync(html) ? { html } : {}),
      };
    })
    .filter(
      (entry) =>
        process.env.CI !== "true" ||
        !fs.readFileSync(entry.script, "utf8").includes("@no-ci"),
    );
}
