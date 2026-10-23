import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";
import {
  compileSources,
  updateReferences,
  outdatedReferences,
  refreshReferences,
  referenceReport,
  checkReferences,
} from "../tools/refs.mjs";

const OLD = "a".repeat(40);
const NEXT = "b".repeat(40);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "reference-refresh-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const configuration = {
    schemaVersion: 1,
    sources: ["host", "docs"].map((id) => ({
      id,
      repository: "example/" + id,
      ref: id === "host" ? "1.0.0" : "main",
      pinCommit: OLD,
      files: ["guide.md"],
      required: ["guide.md"],
      license: { spdx: "MIT", source: "declared" },
      updatePolicy: {
        mode: id === "host" ? "host-bound" : "follow-upstream",
        trackingRef: "@default",
      },
    })),
  };
  await fs.mkdir(path.join(root, "maintenance"));
  await fs.writeFile(
    path.join(root, "maintenance/reference-sources.json"),
    JSON.stringify(configuration),
  );
  await updateReferences({
    root,
    readOffline: () => ({
      commit: OLD,
      files: { "guide.md": Buffer.from("old\n") },
    }),
  });
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (/\/repos\/example\/[^/]+$/.test(url)) return { default_branch: "main" };
    if (url.includes("/commits/")) return { sha: NEXT };
    if (url.includes("/git/trees/"))
      return { tree: [{ type: "blob", path: "guide.md" }] };
    if (url.startsWith("https://raw.githubusercontent.com/"))
      return Buffer.from("new\n");
    throw new Error("Unexpected URL: " + url);
  };
  return { root, configuration, fetcher, calls };
}

async function snapshot(root) {
  return Promise.all(
    [
      "maintenance/reference-sources.json",
      "maintenance/references.lock.json",
      "references/index.json",
      "references/upstream/docs/guide.md",
      "references/upstream/host/guide.md",
    ].map((file) => fs.readFile(path.join(root, file), "utf8")),
  );
}

test("outdated reports host API changes without changing config, lock, index or cache", async (t) => {
  const { root, fetcher } = await fixture(t);
  const before = await snapshot(root);
  const report = await outdatedReferences({ root, fetcher });
  assert.equal(report.changed, 2);
  assert.deepEqual(report.items[0].modified, ["guide.md"]);
  assert.match(referenceReport(report), /保留锁定版本/);
  assert.deepEqual(await snapshot(root), before);
});

test("refresh changes only eligible reference pins and uses the exact inspected payload", async (t) => {
  const { root, fetcher, calls } = await fixture(t);
  const report = await refreshReferences({ root, fetcher });
  assert.equal(report.refreshed, 1);
  assert.deepEqual(report.held, ["host"]);
  const config = JSON.parse(
    await fs.readFile(path.join(root, "maintenance/reference-sources.json")),
  );
  const lock = JSON.parse(
    await fs.readFile(path.join(root, "maintenance/references.lock.json")),
  );
  assert.equal(config.sources[0].pinCommit, OLD);
  assert.equal(config.sources[0].ref, "1.0.0");
  assert.equal(lock.sources.host.commit, OLD);
  assert.equal(config.sources[1].pinCommit, NEXT);
  assert.equal(lock.sources.docs.commit, NEXT);
  assert.equal(
    calls.filter((url) =>
      url.includes("raw.githubusercontent.com/example/docs/"),
    ).length,
    1,
  );
  await checkReferences(root);
});

test("refresh validation failure rolls back config, lock, index and both caches", async (t) => {
  const { root, fetcher } = await fixture(t);
  const before = await snapshot(root);
  await assert.rejects(
    refreshReferences({
      root,
      fetcher,
      validate: () => {
        throw new Error("candidate check failed");
      },
    }),
    /candidate check failed/,
  );
  assert.deepEqual(await snapshot(root), before);
  await checkReferences(root);
});

test("one failed upstream prevents every update and names the failing source", async (t) => {
  const { root, fetcher } = await fixture(t);
  const before = await snapshot(root);
  await assert.rejects(
    refreshReferences({
      root,
      fetcher: (url) => {
        if (url.includes("/example/docs/commits/"))
          throw new Error("HTTP 403 rate limit");
        return fetcher(url);
      },
    }),
    /docs: HTTP 403 rate limit/,
  );
  assert.deepEqual(await snapshot(root), before);
});

test("unrelated commits do not change the report or eligible pins", async (t) => {
  const { root, fetcher } = await fixture(t);
  const sameFiles = (commit) => async (url) =>
    url.includes("/commits/")
      ? { sha: commit }
      : url.startsWith("https://raw.githubusercontent.com/")
        ? Buffer.from("old\n")
        : fetcher(url);
  const first = await outdatedReferences({ root, fetcher: sameFiles(NEXT) });
  const second = await refreshReferences({
    root,
    fetcher: sameFiles("c".repeat(40)),
  });
  assert.equal(first.changed, 0);
  assert.equal(second.refreshed, 0);
  assert.equal(referenceReport(first), referenceReport(second));
});

test("missing required upstream files and unknown source selections are errors", async (t) => {
  const { root, fetcher } = await fixture(t);
  await assert.rejects(
    outdatedReferences({ root, only: new Set(["docs", "typo"]), fetcher }),
    /未知来源: typo/,
  );
  await assert.rejects(
    refreshReferences({
      root,
      fetcher: (url) =>
        url.includes("/git/trees/") ? { tree: [] } : fetcher(url),
    }),
    /host:.*必需.*guide.md/,
  );
});

test("source policy validation rejects modes that could silently upgrade a host", () => {
  assert.throws(
    () =>
      compileSources({
        schemaVersion: 1,
        sources: [
          {
            id: "demo",
            repository: "example/demo",
            ref: "main",
            files: ["README.md"],
            updatePolicy: { mode: "latest", trackingRef: "main" },
          },
        ],
      }),
    /updatePolicy.mode/,
  );
});

test("report lists added, modified and removed selected files", async (t) => {
  const { root, configuration, fetcher } = await fixture(t);
  configuration.sources[1].files.push("obsolete.md", "extra.md");
  await fs.writeFile(
    path.join(root, "maintenance/reference-sources.json"),
    JSON.stringify(configuration),
  );
  await updateReferences({
    root,
    only: new Set(["docs"]),
    readOffline: () => ({
      commit: OLD,
      files: {
        "guide.md": Buffer.from("old\n"),
        "obsolete.md": Buffer.from("obsolete\n"),
      },
    }),
  });
  const report = await outdatedReferences({
    root,
    only: new Set(["docs"]),
    fetcher: (url) =>
      url.includes("/git/trees/")
        ? {
            tree: [
              { type: "blob", path: "guide.md" },
              { type: "blob", path: "extra.md" },
            ],
          }
        : fetcher(url),
  });
  assert.deepEqual(report.items[0].added, ["extra.md"]);
  assert.deepEqual(report.items[0].modified, ["guide.md"]);
  assert.deepEqual(report.items[0].removed, ["obsolete.md"]);
});

test("workflow is valid YAML with scheduled and report-only manual entry points", async () => {
  const workflow = parseYaml(
    await fs.readFile(
      new URL("../.github/workflows/reference-update.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(workflow.on.schedule[0].cron, "23 2 * * 1");
  assert.equal(workflow.on.workflow_dispatch.inputs.refresh.type, "boolean");
  assert.equal(workflow.jobs.references.permissions["pull-requests"], "write");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.ok(
    workflow.jobs.references.steps.some(
      (step) =>
        step.if === "always()" && step.uses === "actions/upload-artifact@v7",
    ),
  );
});
