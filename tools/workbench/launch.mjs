// 双击「打开工作台」后执行：检查环境、按需安装依赖、启动本机服务并打开浏览器。
// 面向不熟悉命令行的队友，所有提示都用平实的中文说明下一步该做什么。
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const noOpen = process.argv.includes("--no-open");
const say = (text = "") => console.log(text ? `  ${text}` : "");
const fail = (lines) => {
  say();
  for (const line of lines) say(line);
  say();
  process.exit(1);
};

say();
say("命定之诗工作台");
say("────────────────────────────");

const major = Number(process.versions.node.split(".")[0]);
if (major < 24)
  fail([
    `当前的 Node.js 版本是 ${process.versions.node}，工作台需要 24 或更新的版本。`,
    "请到 https://nodejs.org/zh-cn/download 下载安装最新的 LTS 版本，然后重新双击「打开工作台」。",
  ]);

const release = JSON.parse(fs.readFileSync(path.join(root, "release.json"), "utf8"));
const origin = new URL(release.localOrigin).origin;

function openBrowser(url) {
  if (noOpen) return;
  const [command, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

// 已经在运行的话直接打开浏览器。
try {
  const response = await fetch(`${origin}/_workbench/catalogs`, { signal: AbortSignal.timeout(1500) });
  if (response.ok) {
    say("工作台已经在运行，已为你打开浏览器。");
    say("这个窗口可以关掉。");
    openBrowser(origin);
    process.exit(0);
  }
} catch {
  /* 没有在运行，继续启动 */
}

// 依赖：第一次使用或依赖清单更新后自动安装。
function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", ...options });
}
function findPnpm() {
  for (const candidate of [["pnpm", []], ["corepack", ["pnpm"]], ["npx", ["--yes", "pnpm@11.17.0"]]]) {
    const probe = spawnSync(candidate[0], [...candidate[1], "--version"], {
      cwd: root,
      shell: process.platform === "win32",
      encoding: "utf8",
      env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
    });
    if (probe.status === 0) return candidate;
  }
  return null;
}
const marker = path.join(root, "node_modules/.modules.yaml");
const lock = path.join(root, "pnpm-lock.yaml");
const needsInstall = !fs.existsSync(marker) || fs.statSync(lock).mtimeMs > fs.statSync(marker).mtimeMs;
if (needsInstall) {
  say("第一次打开（或依赖有更新），正在安装需要的组件。");
  say("需要联网，通常几分钟，请耐心等待，不要关闭窗口……");
  say();
  const pnpm = findPnpm();
  if (!pnpm)
    fail(["没有找到 pnpm，也无法自动获取。", "请检查网络后重试；仍然不行的话，把这个窗口截图发给开发者。"]);
  const result = run(pnpm[0], [...pnpm[1], "install", "--frozen-lockfile"], {
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  if (result.status !== 0) fail(["组件安装失败。请检查网络后重新双击「打开工作台」。", "仍然不行的话，把这个窗口截图发给开发者。"]);
  say();
}

// Python 只在构建和推送时需要，缺了不影响编辑。
const python = spawnSync("python", ["-X", "utf8", "-c", "import yaml"], { encoding: "utf8" });
if (python.error || python.status !== 0) {
  const missingPython = python.error || /not found|was not found|找不到/i.test(python.stderr ?? "") || python.status === 9009;
  if (!missingPython) {
    say("正在安装构建需要的 Python 组件（PyYAML）……");
    const pip = run("python", ["-m", "pip", "install", "-r", "requirements.txt"]);
    if (pip.status !== 0) say("Python 组件没有装好：编辑功能不受影响，但构建和推送到酒馆会失败。");
  } else {
    say("提示：没有找到 Python 3.11 或更新版本。");
    say("编辑开局数据和地图不受影响，但「构建」和「推送到酒馆」需要它。");
    say("安装地址：https://www.python.org/downloads/ （安装时勾选 Add python.exe to PATH）");
  }
  say();
}

const { createWorkspaceServer } = await import("../dev.mjs");
const { server } = await createWorkspaceServer();
server.on("error", (error) => {
  if (error.code === "EADDRINUSE")
    fail([`端口 ${new URL(origin).port} 被别的程序占用了，工作台无法启动。`, "关掉占用它的程序（或重启电脑）后再试。"]);
  fail([`工作台启动失败：${error.message}`]);
});
server.listen(Number(new URL(origin).port), new URL(origin).hostname, () => {
  say(`工作台已经打开：${origin}`);
  say();
  say("请保持这个窗口开着，关掉它工作台就会停止。");
  say("用完以后直接关闭这个窗口即可。");
  say();
  openBrowser(origin);
});
