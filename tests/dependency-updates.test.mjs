import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import {
  inspectDependencies,
  refreshDependencies,
  dependencyReport,
  selectStableTag,
  requestDependency,
} from "../tools/dependencies.mjs";

const COMMIT = "a".repeat(40);
const CDN = "https://testingcf.jsdelivr.net";
const configuration = {
  schemaVersion: 1,
  cdnOrigin: CDN,
  sources: [
    {
      id: "mvu-beta",
      repository: "example/mvu",
      mode: "floating-default",
      artifacts: { mvu: "artifact/bundle.js" },
    },
    {
      id: "workshop",
      repository: "example/workshop",
      mode: "stable-tags",
      tagPattern: "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$",
      artifacts: { workshop: "dist/workshop.js", autoRegex: "dist/regex.js" },
    },
  ],
};

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dependency-updates-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "maintenance"));
  await fs.writeFile(
    path.join(root, "maintenance/dependency-sources.json"),
    JSON.stringify(configuration),
  );
  const release = {
    repository: "example/card",
    tag: "v1",
    published: false,
    dependencies: {
      mvu: {
        version: "default-branch",
        url: CDN + "/gh/example/mvu/artifact/bundle.js",
      },
      workshop: {
        version: "2.3.1",
        url: CDN + "/gh/example/workshop@2.3.1/dist/workshop.js",
      },
      autoRegex: {
        version: "2.3.1",
        url: CDN + "/gh/example/workshop@2.3.1/dist/regex.js",
      },
    },
  };
  await fs.writeFile(
    path.join(root, "release.json"),
    JSON.stringify(release, null, 2),
  );
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url === "https://api.github.com/repos/example/mvu")
      return { default_branch: "master" };
    if (url.includes("/commits/")) return { sha: COMMIT };
    if (url.includes("/tags?"))
      return [
        { name: "2.3.1" },
        { name: "2.3.2" },
        { name: "2.3.3-beta.1" },
        { name: "other-product-10.0.0" },
      ];
    if (url.includes("/releases?")) return [];
    if (
      url.startsWith(CDN) ||
      url.startsWith("https://raw.githubusercontent.com/")
    )
      return Buffer.from("export const script = true;\n");
    throw new Error("Unexpected URL: " + url);
  };
  return { root, release, fetcher, calls };
}

test("outdated checks distribution bytes and reports SHA without changing release", async (t) => {
  const { root, fetcher } = await fixture(t);
  const before = await fs.readFile(path.join(root, "release.json"));
  const report = await inspectDependencies({ root, fetcher, outdated: true });
  assert.equal(report.changed, 1);
  assert.equal(report.items[1].candidateVersion, "2.3.2");
  assert.match(report.items[1].artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(dependencyReport(report), /不添加版本锁/);
  assert.deepEqual(await fs.readFile(path.join(root, "release.json")), before);
});

test("refresh updates paired workshop roles together while preserving floating MVU and card metadata", async (t) => {
  const { root, release, fetcher, calls } = await fixture(t);
  const report = await refreshDependencies({ root, fetcher });
  assert.equal(report.refreshed, 1);
  const updated = JSON.parse(
    await fs.readFile(path.join(root, "release.json")),
  );
  assert.deepEqual(updated.dependencies.mvu, release.dependencies.mvu);
  assert.equal(updated.dependencies.workshop.version, "2.3.2");
  assert.equal(updated.dependencies.autoRegex.version, "2.3.2");
  assert.equal(updated.dependencies.workshop.commit, COMMIT);
  assert.equal(updated.repository, release.repository);
  assert.equal(updated.tag, release.tag);
  assert.equal(updated.published, false);
  assert.ok(!calls.some((url) => url.includes("/example/mvu/tags?")));
});

test("check does not claim that the current version is latest without querying tags", async (t) => {
  const { root, fetcher, calls } = await fixture(t);
  const report = await inspectDependencies({ root, fetcher });
  assert.equal(report.inspectedForUpdates, false);
  assert.ok(!calls.some((url) => url.includes("/tags?")));
  assert.match(dependencyReport(report), /当前固定文件校验通过/);
  assert.doesNotMatch(dependencyReport(report), /最新匹配/);
});

test("recorded fixed SHA and commit detect altered content or a moved tag", async (t) => {
  const { root, fetcher } = await fixture(t);
  await refreshDependencies({ root, fetcher });
  await assert.rejects(
    inspectDependencies({
      root,
      fetcher: (url) =>
        url.includes("/commits/2.3.2") ? { sha: "b".repeat(40) } : fetcher(url),
    }),
    /tag.*commit 不一致/,
  );
  await assert.rejects(
    inspectDependencies({
      root,
      fetcher: (url) =>
        url.startsWith(CDN) ||
        url.startsWith("https://raw.githubusercontent.com/")
          ? Buffer.from("altered scripts")
          : fetcher(url),
    }),
    /已记录的 SHA256 不一致/,
  );
});

test("one missing paired artifact fails the complete refresh without partial writes", async (t) => {
  const { root, fetcher } = await fixture(t);
  const before = await fs.readFile(path.join(root, "release.json"));
  await assert.rejects(
    refreshDependencies({
      root,
      fetcher: (url) => {
        if (url.includes("@2.3.2/dist/regex.js"))
          throw new Error("HTTP 404 regex.js");
        return fetcher(url);
      },
    }),
    /workshop: HTTP 404 regex.js/,
  );
  assert.deepEqual(await fs.readFile(path.join(root, "release.json")), before);
});

test("HTML, mismatched CDN bytes and rate limiting are named failures", async (t) => {
  const { root, fetcher } = await fixture(t);
  for (const [replacement, message] of [
    [Buffer.from("<html>error</html>"), /HTML/],
    [Buffer.from("wrong build"), /CDN.*不一致/],
  ]) {
    await assert.rejects(
      inspectDependencies({
        root,
        outdated: true,
        fetcher: (url) =>
          url.includes("@2.3.2/dist/regex.js") ? replacement : fetcher(url),
      }),
      message,
    );
  }
  await assert.rejects(
    inspectDependencies({
      root,
      outdated: true,
      fetcher: (url) => {
        if (url.includes("/tags?")) throw new Error("HTTP 403 rate limit");
        return fetcher(url);
      },
    }),
    /workshop: HTTP 403 rate limit/,
  );
});

test("failed candidate validation restores the original release bytes", async (t) => {
  const { root, fetcher } = await fixture(t);
  const before = await fs.readFile(path.join(root, "release.json"));
  await assert.rejects(
    refreshDependencies({
      root,
      fetcher,
      validate: () => {
        throw new Error("verify failed");
      },
    }),
    /verify failed/,
  );
  assert.deepEqual(await fs.readFile(path.join(root, "release.json")), before);
});

test("an unchanged candidate does not rewrite release or create a timestamp change", async (t) => {
  const { root, fetcher } = await fixture(t);
  await refreshDependencies({ root, fetcher });
  const previousReport = await inspectDependencies({
    root,
    fetcher,
    outdated: true,
  });
  const file = path.join(root, "release.json"),
    before = await fs.readFile(file),
    stat = await fs.stat(file);
  const report = await refreshDependencies({ root, fetcher });
  assert.equal(report.changed, 0);
  assert.deepEqual(await fs.readFile(file), before);
  assert.equal((await fs.stat(file)).mtimeMs, stat.mtimeMs);
  assert.equal(dependencyReport(previousReport), dependencyReport(report));
});

test("tag selection compares numeric versions and excludes other products, drafts and prereleases", () => {
  const source = configuration.sources[1];
  const tags = [
    "2.9.0",
    "2.10.0",
    "2.11.0-beta",
    "plugin-9.0.0",
    "3.0.0",
    "4.0.0",
  ].map((name) => ({ name }));
  assert.equal(
    selectStableTag(source, tags, [
      { tag_name: "3.0.0", prerelease: true },
      { tag_name: "4.0.0", draft: true },
    ]),
    "2.10.0",
  );
  assert.throws(
    () => selectStableTag(source, [{ name: "2.4.0-rc.1" }], []),
    /没有匹配/,
  );
});

test("pagination inspects tags beyond the first page", async (t) => {
  const { root, fetcher } = await fixture(t);
  const report = await inspectDependencies({
    root,
    outdated: true,
    fetcher: (url) => {
      if (url.includes("/tags?") && url.endsWith("page=1"))
        return Array.from({ length: 100 }, (_, index) => ({
          name: "2.0." + index,
        }));
      if (url.includes("/tags?") && url.endsWith("page=2"))
        return [{ name: "2.20.0" }];
      return fetcher(url);
    },
  });
  assert.equal(report.items[1].candidateVersion, "2.20.0");
});

test("release modifications during inspection are detected instead of overwritten", async (t) => {
  const { root, fetcher } = await fixture(t);
  let changed = false;
  await assert.rejects(
    refreshDependencies({
      root,
      fetcher: async (url) => {
        if (!changed) {
          changed = true;
          await fs.appendFile(path.join(root, "release.json"), "\n");
        }
        return fetcher(url);
      },
    }),
    /检查期间发生更改/,
  );
});

test("distribution requests never forward the GitHub token to the CDN", async (t) => {
  const previous = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previous;
  });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.authorization, undefined);
    return new Response("export default true;", { status: 200 });
  };
  await requestDependency(CDN + "/gh/example/demo/file.js");
});

test("the dependency workflow defines weekly/manual runs and preserves a report artifact", async () => {
  const workflow = parseYaml(
    await fs.readFile(
      new URL("../.github/workflows/dependency-update.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(workflow.on.schedule[0].cron, "43 2 * * 1");
  assert.equal(workflow.on.workflow_dispatch.inputs.refresh.type, "boolean");
  assert.equal(
    workflow.jobs.dependencies.permissions["pull-requests"],
    "write",
  );
  assert.ok(
    workflow.jobs.dependencies.steps.some(
      (step) =>
        step.uses === "actions/upload-artifact@v7" && step.if === "always()",
    ),
  );
});
