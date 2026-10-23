import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, readJSON, jsonText, sha256 } from "./lib/references-files.mjs";
import { inside, githubHeaders } from "./refs.mjs";

const CONFIG = "maintenance/dependency-sources.json";
const RELEASE = "release.json";
const MAX_BYTES = 24 * 1024 * 1024;

export async function requestDependency(url, { json = false } = {}) {
  // Never send the repository token to a CDN or raw artifact host.
  const headers =
    new URL(url).hostname === "api.github.com"
      ? githubHeaders()
      : { "user-agent": "destined-poem-dependencies" };
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("HTTP " + response.status + ": " + url);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (json) return JSON.parse(bytes.toString("utf8"));
  return bytes;
}

function versionParts(tag) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  return match ? match.slice(1).map(BigInt) : null;
}

export function compareVersions(left, right) {
  const a = versionParts(left),
    b = versionParts(right);
  if (!a || !b) throw new Error("需要正式语义版本: " + left + ", " + right);
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export function validateDependencyConfig(config) {
  if (
    config?.schemaVersion !== 1 ||
    !Array.isArray(config.sources) ||
    !config.sources.length
  )
    throw new Error("dependency-sources.json: 无效结构。");
  if (config.cdnOrigin !== "https://testingcf.jsdelivr.net")
    throw new Error("dependency-sources.json: 未配置支持的 CDN 来源。");
  const ids = new Set(),
    roles = new Set();
  for (const source of config.sources) {
    if (!/^[a-z0-9-]+$/.test(source.id) || ids.has(source.id))
      throw new Error("重复或无效来源: " + source.id);
    ids.add(source.id);
    if (!/^[\w.-]+\/[\w.-]+$/.test(source.repository))
      throw new Error(source.id + ": repository 必须为 owner/name。");
    if (!["floating-default", "stable-tags"].includes(source.mode))
      throw new Error(source.id + ": mode 无效。");
    if (source.mode === "stable-tags") {
      if (
        typeof source.tagPattern !== "string" ||
        !source.tagPattern.startsWith("^") ||
        !source.tagPattern.endsWith("$")
      )
        throw new Error(source.id + ": tagPattern 必须完整匹配产品正式 tag。");
      new RegExp(source.tagPattern);
    }
    if (!source.artifacts || !Object.keys(source.artifacts).length)
      throw new Error(source.id + ": artifacts 不能为空。");
    for (const [role, file] of Object.entries(source.artifacts)) {
      if (roles.has(role)) throw new Error("重复依赖角色: " + role);
      roles.add(role);
      inside(ROOT, file);
      if (!file.endsWith(".js"))
        throw new Error(source.id + ": 分发文件必须为 .js。");
    }
  }
  return config;
}

function artifactUrl(config, source, file, tag = null) {
  return (
    config.cdnOrigin +
    "/gh/" +
    source.repository +
    (tag ? "@" + tag : "") +
    "/" +
    file
  );
}

export function validateArtifact(bytes, label) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES)
    throw new Error(label + ": 分发文件为空或超出大小限制。");
  const head = bytes.subarray(0, 1024).toString("utf8").trimStart();
  if (/^<(?:!doctype\s+html|html|head|body)\b/i.test(head))
    throw new Error(label + ": 分发地址返回 HTML。");
  if (bytes.includes(0)) throw new Error(label + ": 分发文件含二进制内容。");
  return { sha256: sha256(bytes), bytes: bytes.length };
}

async function paginated(repository, kind, fetcher) {
  const result = [];
  for (let page = 1; page <= 100; page++) {
    const rows = await fetcher(
      "https://api.github.com/repos/" +
        repository +
        "/" +
        kind +
        "?per_page=100&page=" +
        page,
      { json: true },
    );
    if (!Array.isArray(rows))
      throw new Error(repository + ": " + kind + " 未返回列表。");
    result.push(...rows);
    if (rows.length < 100) return result;
  }
  throw new Error(
    repository + ": " + kind + " 分页超过限制，无法完整检查版本。",
  );
}

export function selectStableTag(source, tags, releases) {
  const excluded = new Set(
    releases
      .filter((item) => item.draft || item.prerelease)
      .map((item) => item.tag_name),
  );
  const pattern = new RegExp(source.tagPattern);
  const candidates = [
    ...new Set([
      ...tags.map((item) => item.name),
      ...releases
        .filter((item) => !item.draft && !item.prerelease)
        .map((item) => item.tag_name),
    ]),
  ]
    .filter(
      (tag) =>
        typeof tag === "string" &&
        pattern.test(tag) &&
        versionParts(tag) &&
        !excluded.has(tag),
    )
    .sort((a, b) => compareVersions(b, a));
  if (!candidates.length)
    throw new Error(source.id + ": 没有匹配该产品的正式语义版本 tag/release。");
  return candidates[0];
}

async function commitAt(source, ref, fetcher) {
  const response = await fetcher(
    "https://api.github.com/repos/" +
      source.repository +
      "/commits/" +
      encodeURIComponent(ref),
    { json: true },
  );
  if (!/^[a-f0-9]{40}$/.test(response?.sha ?? ""))
    throw new Error(source.id + ": 未取到完整提交哈希。");
  return response.sha;
}

async function load(root) {
  const configuration = validateDependencyConfig(
    await readJSON(path.join(root, CONFIG)),
  );
  const releaseBytes = fs.readFileSync(path.join(root, RELEASE));
  const release = JSON.parse(
    releaseBytes.toString("utf8").replace(/^\uFEFF/, ""),
  );
  const expected = configuration.sources
    .flatMap((source) => Object.keys(source.artifacts))
    .sort();
  if (
    jsonText(Object.keys(release.dependencies ?? {}).sort()) !==
    jsonText(expected)
  )
    throw new Error(
      "release.json 的依赖角色与 dependency-sources.json 不一致。",
    );
  for (const source of configuration.sources) {
    let groupVersion;
    for (const [role, file] of Object.entries(source.artifacts)) {
      const dependency = release.dependencies[role];
      const floating = source.mode === "floating-default";
      if (
        !floating &&
        (!versionParts(dependency.version) ||
          !new RegExp(source.tagPattern).test(dependency.version))
      )
        throw new Error(
          source.id + "/" + role + ": 当前依赖必须锁定本产品正式 tag。",
        );
      if (!floating && groupVersion && groupVersion !== dependency.version)
        throw new Error(source.id + ": 同仓分发角色版本不一致。");
      groupVersion = dependency.version;
      if (
        dependency.url !==
        artifactUrl(
          configuration,
          source,
          file,
          floating ? null : dependency.version,
        )
      )
        throw new Error(
          source.id +
            "/" +
            role +
            ": URL 与来源配置不一致；浮动依赖必须使用不带 @ 的默认分支链接。",
        );
    }
  }
  return { configuration, release, releaseBytes };
}

export async function inspectDependencies({
  root = ROOT,
  fetcher = requestDependency,
  outdated = false,
} = {}) {
  const { configuration, release, releaseBytes } = await load(root);
  const items = [],
    errors = [];
  for (const source of configuration.sources) {
    try {
      const floating = source.mode === "floating-default";
      const currentVersion =
        release.dependencies[Object.keys(source.artifacts)[0]].version ??
        "default-branch";
      let candidateVersion = currentVersion,
        trackingRef,
        commit;
      if (floating) {
        const repository = await fetcher(
          "https://api.github.com/repos/" + source.repository,
          { json: true },
        );
        trackingRef = repository.default_branch;
        if (!trackingRef) throw new Error("未返回默认分支。");
        commit = await commitAt(source, trackingRef, fetcher);
      } else {
        if (outdated) {
          const [tags, releases] = await Promise.all([
            paginated(source.repository, "tags", fetcher),
            paginated(source.repository, "releases", fetcher),
          ]);
          const latest = selectStableTag(source, tags, releases);
          if (compareVersions(latest, currentVersion) > 0)
            candidateVersion = latest;
        }
        commit = await commitAt(source, candidateVersion, fetcher);
      }
      const artifacts = [];
      for (const [role, file] of Object.entries(source.artifacts)) {
        const url = artifactUrl(
          configuration,
          source,
          file,
          floating ? null : candidateVersion,
        );
        const bytes = await fetcher(url);
        const evidence = validateArtifact(bytes, source.id + "/" + role);
        if (!floating) {
          const raw = await fetcher(
            "https://raw.githubusercontent.com/" +
              source.repository +
              "/" +
              commit +
              "/" +
              file,
          );
          validateArtifact(raw, source.id + "/" + role + " (Git)");
          if (sha256(raw) !== evidence.sha256)
            throw new Error(
              role + ": CDN 与该 tag 对应 Git 提交的分发字节不一致。",
            );
          const baseline = release.dependencies[role];
          if (
            candidateVersion === currentVersion &&
            baseline.sha256 &&
            baseline.sha256 !== evidence.sha256
          )
            throw new Error(role + ": 固定依赖内容与已记录的 SHA256 不一致。");
          if (
            candidateVersion === currentVersion &&
            baseline.commit &&
            baseline.commit !== commit
          )
            throw new Error(
              role + ": 固定 tag 的提交与已记录的 commit 不一致。",
            );
        }
        artifacts.push({ role, file, url, ...evidence });
      }
      items.push({
        id: source.id,
        repository: source.repository,
        mode: source.mode,
        currentVersion,
        candidateVersion,
        changed: !floating && candidateVersion !== currentVersion,
        ...(floating
          ? {
              trackingRef,
              note: "默认分支浮动链接；提交仅为检查时的上游快照，CDN 可能缓存；不添加版本锁。",
            }
          : {}),
        commit,
        artifacts,
        compareUrl:
          "https://github.com/" +
          source.repository +
          (floating
            ? "/commits/" + trackingRef
            : "/compare/" + currentVersion + "..." + candidateVersion),
      });
    } catch (error) {
      errors.push(source.id + ": " + error.message);
    }
  }
  if (errors.length) throw new Error("依赖检查失败：\n" + errors.join("\n"));
  return {
    sources: items.length,
    changed: items.filter((item) => item.changed).length,
    inspectedForUpdates: outdated,
    releaseSha256: sha256(releaseBytes),
    items,
  };
}

function atomic(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp-" + process.pid;
  try {
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export async function refreshDependencies({
  root = ROOT,
  fetcher = requestDependency,
  validate = () => {},
} = {}) {
  const report = await inspectDependencies({ root, fetcher, outdated: true });
  const file = path.join(root, RELEASE),
    before = fs.readFileSync(file);
  if (sha256(before) !== report.releaseSha256)
    throw new Error("release.json 在检查期间发生更改，请重新检查后更新。");
  if (!report.changed) return { ...report, refreshed: 0 };
  const release = JSON.parse(before.toString("utf8").replace(/^\uFEFF/, ""));
  for (const item of report.items.filter((item) => item.changed))
    for (const artifact of item.artifacts)
      release.dependencies[artifact.role] = {
        ...release.dependencies[artifact.role],
        version: item.candidateVersion,
        url: artifact.url,
        commit: item.commit,
        sha256: artifact.sha256,
      };
  atomic(file, jsonText(release));
  try {
    await validate();
  } catch (error) {
    atomic(file, before);
    throw error;
  }
  return { ...report, refreshed: report.changed };
}

export function dependencyReport(report) {
  const lines = [
    "# 第三方分发依赖检查",
    "",
    "固定依赖按本产品正式语义版本检查；MVU beta 保持默认分支无 @ 链接。宿主/API 参考版本另行审查。",
    "",
  ];
  for (const item of report.items) {
    lines.push(
      "## " + item.id,
      "",
      item.mode === "floating-default"
        ? item.note
        : "`" +
            item.currentVersion +
            "` → `" +
            item.candidateVersion +
            "`；" +
            (item.changed
              ? "有更新，待审查"
              : report.inspectedForUpdates
                ? "当前已是最新匹配正式 tag"
                : "当前固定文件校验通过") +
            "。",
      "",
      "[上游比较/历史](" +
        item.compareUrl +
        ")；检查提交：`" +
        item.commit +
        "`。",
      "",
    );
    for (const artifact of item.artifacts)
      lines.push(
        "- `" +
          artifact.role +
          "`：[" +
          artifact.file +
          "](" +
          artifact.url +
          ")，" +
          artifact.bytes +
          " 字节；SHA256：`" +
          artifact.sha256 +
          "`。",
      );
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

export async function main(argv = process.argv.slice(2)) {
  const [command = "check", ...args] = argv;
  if (!["check", "outdated", "refresh"].includes(command))
    throw new Error(
      "deps 支持 check、outdated、refresh [--report <项目内路径>]。",
    );
  let reportFile;
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--report" || !args[index + 1])
      throw new Error("未知参数或缺少报告路径: " + args[index]);
    reportFile = inside(ROOT, args[++index]);
  }
  const result =
    command === "refresh"
      ? await refreshDependencies()
      : await inspectDependencies({ outdated: command === "outdated" });
  if (reportFile) atomic(reportFile, dependencyReport(result));
  return { ok: true, command, ...result };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main()
    .then((result) => process.stdout.write(jsonText(result)))
    .catch((error) => {
      process.stdout.write(
        jsonText({
          ok: false,
          command: process.argv[2] ?? "check",
          error: error.message,
        }),
      );
      process.exitCode = 1;
    });
}
