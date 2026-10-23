import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
const major = Number(process.versions.node.split(".")[0]);
if (major < 24) throw new Error("需要 Node.js 24 或以上");
const pnpmCommand = process.env.npm_execpath ? process.execPath : "pnpm";
const pnpmPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
const pnpmOptions = {
  shell: !process.env.npm_execpath && process.platform === "win32",
};
const version = execFileSync(pnpmCommand, [...pnpmPrefix, "--version"], {
  ...pnpmOptions,
  encoding: "utf8",
}).trim();
if (version !== "11.17.0")
  throw new Error(`需要 pnpm 11.17.0；当前 ${version}，请使用工作区声明的版本`);
const result = spawnSync(
  pnpmCommand,
  [...pnpmPrefix, "install", "--frozen-lockfile"],
  { ...pnpmOptions, stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status ?? 1);
try {
  execFileSync(
    "python",
    [
      "-X",
      "utf8",
      "-c",
      'import sys, yaml; assert sys.version_info >= (3, 11); assert yaml.__version__ == "6.0.3", yaml.__version__; print("Python/PyYAML", sys.version.split()[0], yaml.__version__)',
    ],
    { stdio: "inherit" },
  );
} catch {
  throw new Error(
    "地理生成需要 Python 3.11+ 和 PyYAML 6.0.3，见 requirements.txt",
  );
}
console.log(
  JSON.stringify({
    ok: true,
    node: process.version,
    pnpm: version,
    refs: fs.existsSync("references/index.json")
      ? "restored"
      : "run pnpm refs restore",
  }),
);
