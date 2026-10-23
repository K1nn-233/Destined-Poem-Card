import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./lib/card-source.mjs";

const directory = path.join(ROOT, ".cache/verification");
fs.mkdirSync(directory, { recursive: true });
const startedAt = new Date().toISOString();
const steps = [];
const pnpm = process.env.npm_execpath;
const command = pnpm ? process.execPath : "pnpm";
const prefix = pnpm ? [pnpm] : [];
const checks = [
  ["tests", ["test"]],
  ["types", ["typecheck"]],
  ["vue-templates", ["--filter", "@destiny/frontend", "typecheck:vue"]],
  ["ejs-templates", ["exec", "node", "tools/check-templates.mjs"]],
  ["card-sources", ["card", "check"]],
  ["references", ["refs", "check"]],
  ["local-build", ["card", "build", "--profile", "local"]],
  ["release-build", ["card", "build", "--profile", "release"]],
  ["artifacts", ["exec", "node", "tools/check-artifacts.mjs"]],
];

for (const [name, args] of checks) {
  console.log(`[verify] ${name} …`);
  const log = path.join(directory, name + ".log");
  const descriptor = fs.openSync(log, "w");
  const start = Date.now();
  let result;
  try {
    result = spawnSync(command, [...prefix, ...args], {
      cwd: ROOT,
      shell: !pnpm && process.platform === "win32",
      stdio: ["ignore", descriptor, descriptor],
    });
  } finally {
    fs.closeSync(descriptor);
  }
  const passed = !result.error && result.status === 0;
  steps.push({
    name,
    command: ["pnpm", ...args].join(" "),
    passed,
    exitCode: result.status,
    milliseconds: Date.now() - start,
    log: path.relative(ROOT, log).replaceAll("\\", "/"),
  });
  fs.writeFileSync(
    path.join(directory, "static.json"),
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        passed: passed && steps.length === checks.length,
        steps,
        scope:
          "Unit tests, static checks and generated artifacts. Browser/host and model generation are separate.",
      },
      null,
      2,
    ) + "\n",
  );
  if (!passed) {
    console.error(fs.readFileSync(log, "utf8").slice(-12000));
    if (result.error) console.error(result.error.message);
    console.error(`[verify] ${name} failed; see ${path.relative(ROOT, log)}`);
    process.exit(result.status || 1);
  }
  console.log(
    `[verify] ${name} passed (${((Date.now() - start) / 1000).toFixed(1)}s)`,
  );
}
console.log(
  "[verify] All static/build checks passed. Evidence: .cache/verification/static.json",
);
