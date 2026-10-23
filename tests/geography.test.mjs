import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { generateGeography } from "../tools/geography.mjs";
import { ROOT } from "../tools/lib/card-source.mjs";
import YAML from "yaml";

let directory;
let source;
let result;
test.before(async () => {
  const parent = path.join(ROOT, ".cache");
  await fs.mkdir(parent, { recursive: true });
  directory = await fs.mkdtemp(path.join(parent, "geography-test-"));
  result = await generateGeography({ outputDir: directory });
  source = await fs.readFile(result.loaderPath, "utf8");
});
test.after(async () => {
  if (
    directory &&
    path.dirname(directory) === path.join(ROOT, ".cache") &&
    path.basename(directory).startsWith("geography-test-")
  )
    await fs.rm(directory, { recursive: true, force: true });
});

function load(existing, answer = "y", storage = new Map()) {
  const writes = [];
  const listeners = [];
  let variables = existing ? { runtime_geo_compact_data: existing } : {};
  let prompts = 0;
  const value = vm.runInNewContext(source, {
    getVariables(options) {
      assert.equal(options.type, "chat");
      return variables;
    },
    insertOrAssignVariables(data, options) {
      writes.push(JSON.parse(JSON.stringify({ data, options })));
      Object.assign(variables, data);
    },
    tavern_events: { CHAT_CHANGED: "chat_id_changed" },
    eventOn(event, callback) {
      assert.equal(event, "chat_id_changed");
      listeners.push(callback);
    },
    prompt() {
      prompts += 1;
      return answer;
    },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
  });
  return {
    value,
    get prompts() {
      return prompts;
    },
    writes,
    listeners,
    changeChat(next) {
      variables = next ? { runtime_geo_compact_data: next } : {};
      for (const callback of listeners) callback();
    },
  };
}

test("geography generation derives chat graph and character markers from the same source", async () => {
  const places = YAML.parse(
    await fs.readFile(
      path.join(ROOT, "content/geography/places.yaml"),
      "utf8",
    ),
  ).places;
  const edges = YAML.parse(
    await fs.readFile(
      path.join(ROOT, "content/geography/edges.yaml"),
      "utf8",
    ),
  ).edges;
  const loaded = load();
  assert.equal(loaded.prompts, 0);
  assert.equal(loaded.writes.length, 1);
  const { data, options } = loaded.writes[0];
  assert.equal(options.type, "chat");
  assert.equal(data.runtime_geo_compact_data.places.length, places.length);
  assert.equal(data.runtime_geo_compact_data.edges.length, edges.length);
  assert.equal(data.runtime_geo_compact_data.version, result.version);
  assert.match(result.version, /^sha256:[a-f0-9]{16}$/);
  for (const file of [
    "compact/place.yaml",
    "compact/edges.yaml",
    "load_compact.js",
  ])
    assert.doesNotMatch(
      await fs.readFile(path.join(directory, file), "utf8"),
      /\r/,
      "geography artifacts must use LF on Windows and Linux",
    );
  assert.deepEqual(
    result.mapMarkers,
    places.filter((place) => place.marker).map((place) => place.marker),
  );
});

test("current graph is reused without prompting or rewriting", () => {
  const loaded = load({ version: result.version });
  assert.equal(loaded.prompts, 0);
  assert.equal(loaded.writes.length, 0);
});

test("new chats receive their own graph through one lifecycle listener", () => {
  const loaded = load({ version: result.version });
  assert.equal(loaded.writes.length, 0);
  assert.equal(loaded.listeners.length, 1);
  loaded.changeChat();
  assert.equal(loaded.writes.length, 1);
  assert.equal(
    loaded.writes[0].data.runtime_geo_compact_data.version,
    result.version,
  );
  loaded.changeChat({ version: result.version });
  assert.equal(loaded.writes.length, 1);
  assert.equal(loaded.listeners.length, 1);
});

test("old numeric versions can be replaced despite their larger number; declining preserves data", () => {
  assert.equal(load({ version: 2025052501 }, "y").writes.length, 1);
  assert.equal(load({ version: 2025052501 }, "n").writes.length, 0);
});

test("skip reminders belong to one content version", () => {
  const storage = new Map();
  assert.equal(load({ version: "old" }, "s", storage).prompts, 1);
  assert.equal(load({ version: "old" }, "y", storage).prompts, 0);
  assert.equal(load({ version: "old" }, "y", storage).writes.length, 0);
  assert.equal(
    [...storage.keys()][0],
    `runtime_geo_compact_data.skip_update_prompt.${result.version}`,
  );
});
