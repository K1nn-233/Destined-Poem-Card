import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../tools/lib/card-source.mjs";

const script = path.join(ROOT, "tools/geography/scripts/audit_edges_raw.py");
const places = [{ id: "a", parent: null }, { id: "b", parent: null }];
const segment = { transport: "商队", days: 2, terrain: ["平原"], direction: "东-西" };
function edge(id, overrides = {}) {
  return { id, from: "a", to: "b", bidirectional: true, importance: 2, segments: [{ ...segment }], ...overrides };
}
function audit(edges, sourcePlaces = places) {
  const result = spawnSync("python", ["-X", "utf8", "-c", `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("geo_audit", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
data = json.load(sys.stdin)
print(json.dumps(module.audit(data["places"], data["edges"], 0.02)))
`, script], { cwd: ROOT, encoding: "utf8", input: JSON.stringify({ places: sourcePlaces, edges }) });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("parallel transport routes, custom IDs/directions and empty optional fields are valid", () => {
  const findings = audit([
    edge("a__b"),
    edge("rail_service", { bidirectional: false, segments: [{ transport: "列车", days: 1, terrain: [], direction: "西北-东南" }] }),
    edge("ferry", { segments: [{ transport: "船只", days: null, terrain: [], direction: "城市海岛周边", description: "" }] }),
  ]);
  assert.deepEqual(findings, []);
});

test("fractional days are valid data", () => {
  assert.deepEqual(audit([edge("rail", { segments: [{ ...segment, days: 0.6 }] })]), []);
});

test("identical routes are reported once, including reversed bidirectional routes", () => {
  const findings = audit([
    edge("original"),
    edge("copy"),
    edge("reverse", { from: "b", to: "a", segments: [{ ...segment, direction: "西-东" }] }),
  ]);
  assert.deepEqual(findings.map((finding) => finding.code), ["duplicate_route", "duplicate_route"]);
  assert.ok(findings.every((finding) => finding.severity === "warning"));
});

test("dangling endpoints, duplicate IDs and malformed segment values remain errors", () => {
  const findings = audit([
    edge("same", { to: "missing", bidirectional: "true", segments: [{ ...segment, days: "2", terrain: "平原" }] }),
    edge("same", { segments: [{ ...segment, days: true }] }),
    edge("negative", { segments: [{ ...segment, days: -1 }] }),
  ]);
  const codes = findings.filter((finding) => finding.severity === "error").map((finding) => finding.code);
  for (const code of ["duplicate_edge_id", "unknown_to", "bad_bidirectional", "bad_days", "bad_terrain"])
    assert.ok(codes.includes(code), code);
  assert.equal(codes.filter((code) => code === "bad_days").length, 3);
});

test("coordinate disagreement is explicitly a manual-review heuristic", () => {
  const findings = audit([edge("route")], [
    { id: "a", marker: { position: { nx: 0, ny: 0 } } },
    { id: "b", marker: { position: { nx: 1, ny: 0 } } },
  ]);
  assert.equal(findings[0].code, "coordinate_direction_mismatch");
  assert.equal(findings[0].severity, "warning");
  assert.match(findings[0].message, /heuristic only/);
});

test("CLI returns nonzero for broken references and succeeds for valid parallel routes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "destiny-geo-audit-"));
  try {
    const placeFile = path.join(directory, "places.yaml");
    const edgeFile = path.join(directory, "edges.yaml");
    await fs.writeFile(placeFile, JSON.stringify({ places }));
    for (const [edges, status] of [
      [[edge("broken", { to: "missing" })], 1],
      [[edge("road"), edge("rail", { segments: [{ ...segment, transport: "列车", days: 0.6 }] })], 0],
    ]) {
      await fs.writeFile(edgeFile, JSON.stringify({ edges }));
      const result = spawnSync("python", ["-X", "utf8", script, "--places", placeFile, "--edges", edgeFile], { cwd: ROOT, encoding: "utf8" });
      assert.equal(result.status, status, result.stdout + result.stderr);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
