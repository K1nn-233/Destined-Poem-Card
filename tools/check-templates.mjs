import fs from "node:fs/promises";
import path from "node:path";
import ejs from "ejs";
import { loadWorldbook } from "./lib/card-source.mjs";

export async function checkTemplates() {
  const { references } = await loadWorldbook();
  const errors = [];
  let compiled = 0;
  for (const reference of references) {
    const text = await fs.readFile(reference.file, "utf8");
    if (!text.includes("<%")) continue;
    try {
      ejs.compile(text, { async: true, filename: reference.file });
      compiled += 1;
    } catch (error) {
      errors.push({
        entry: reference.entry.名称,
        file: reference.file,
        message: error.message,
      });
    }
  }
  if (errors.length)
    throw new Error(JSON.stringify({ compiled, errors }, null, 2));
  return { compiled, evaluated: false };
}
if (
  process.argv[1] &&
  path.basename(process.argv[1]) === "check-templates.mjs"
) {
  try {
    console.log(JSON.stringify(await checkTemplates()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
