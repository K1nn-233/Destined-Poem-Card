import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const sourceRoot = new URL(
  "../packages/frontend/src/apps/status/core/",
  import.meta.url,
);
function loadSource(relative, dependencies = {}) {
  const code = ts.transpileModule(
    readFileSync(new URL(relative, sourceRoot), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    module,
    module.exports,
  );
  return module.exports;
}

// Deliberately never execute state updaters/commit a React render: this models
// blur followed by a parent tab switch in the same batch.
function deferredReact() {
  const effects = [];
  return {
    useState: (initial) => [
      typeof initial === "function" ? initial() : initial,
      () => {},
    ],
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useEffect: (effect) => effects.push(effect),
    mount: () => effects.map((effect) => effect()).filter(Boolean),
  };
}

const marker = {
  id: "harbor",
  name: "雾晶港",
  description: "港口",
  position: { nx: 0.3, ny: 0.4 },
};
function host() {
  let current = "original.png";
  const writes = [];
  globalThis.getCurrentCharacterId = () => current;
  globalThis.getVariables = () => ({
    map_markers: [structuredClone(marker)],
    map_drawings: [],
  });
  globalThis.insertOrAssignVariables = (variables, options) => {
    writes.push({
      character: current,
      variables: structuredClone(variables),
      options,
    });
  };
  return {
    writes,
    switchCharacter: () => {
      current = "other.png";
    },
  };
}

test("marker blur/add/delete persist immediately without a React commit", () => {
  const { writes } = host();
  const service = loadSource("services/map-state.ts");
  const snapshot = service.readMapState();
  const React = deferredReact();
  const { useMapMarkers } = loadSource("hooks/use-map-markers.ts", {
    react: React,
    openseadragon: {},
    "../utils/map-constants": {
      DEFAULT_MARKER_ICON: "pin",
      DEFAULT_MARKER_COLOR: "#fff",
    },
  });
  const map = useMapMarkers({
    viewerRef: { current: null },
    classNames: {},
    initialMarkers: snapshot.markers,
    onChange: (markers) =>
      service.saveMapMarkers(snapshot.characterId, markers),
  });
  map.updateMarker("harbor", { description: "港口· 工作区联调" });
  assert.equal(
    writes.at(-1).variables.map_markers[0].description,
    "港口· 工作区联调",
  );
  map.addMarkerAt(0.1, 0.2);
  assert.equal(writes.at(-1).variables.map_markers.length, 2);
  assert.equal(
    writes.at(-1).variables.map_markers[0].description,
    "港口· 工作区联调",
  );
  map.deleteMarker("harbor");
  assert.equal(writes.at(-1).variables.map_markers.length, 1);
  assert.equal(writes.length, 3);
});

test("both map writers reject stale character identity and preserve host failures", () => {
  const { writes, switchCharacter } = host();
  const service = loadSource("services/map-state.ts");
  const { characterId } = service.readMapState();
  globalThis.insertOrAssignVariables = () => {
    throw new Error("host failed");
  };
  assert.throws(() => service.saveMapMarkers(characterId, []), /host failed/);
  switchCharacter();
  assert.throws(() => service.saveMapMarkers(characterId, []), /角色已切换/);
  assert.throws(() => service.saveMapDrawings(characterId, []), /角色已切换/);
  assert.equal(writes.length, 0);
});

function drawingHook(onChange) {
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const React = deferredReact();
  const { useCanvasDraw } = loadSource("hooks/use-canvas-draw.ts", {
    react: React,
  });
  const ctx = {
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  const canvas = {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    width: 100,
    height: 100,
  };
  const hook = useCanvasDraw({
    enabled: true,
    containerRef: { current: canvas },
    canvasRef: { current: canvas },
    initialStrokes: [],
    onChange,
  });
  const cleanups = React.mount();
  return { hook, unmount: () => cleanups.forEach((cleanup) => cleanup()) };
}

test("completed/cleared drawings save immediately and unmount flushes unfinished strokes once", () => {
  const { writes } = host();
  const service = loadSource("services/map-state.ts");
  const { characterId } = service.readMapState();
  const { hook, unmount } = drawingHook((strokes) =>
    service.saveMapDrawings(characterId, strokes),
  );
  hook.handlePointerDown({ clientX: 10, clientY: 10 });
  hook.handlePointerMove({ clientX: 20, clientY: 20 });
  hook.handlePointerUp();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].variables.map_drawings[0].points.length, 2);
  hook.clearCanvas();
  assert.deepEqual(writes.at(-1).variables.map_drawings, []);
  hook.handlePointerDown({ clientX: 30, clientY: 30 });
  hook.handlePointerMove({ clientX: 40, clientY: 40 });
  unmount();
  assert.equal(writes.length, 3);
  assert.equal(writes.at(-1).variables.map_drawings[0].points.length, 2);
  unmount();
  assert.equal(writes.length, 3);
});

test("drawing unmount after switching characters cannot write to the new role", () => {
  const { writes, switchCharacter } = host();
  const service = loadSource("services/map-state.ts");
  const { characterId } = service.readMapState();
  const { hook, unmount } = drawingHook((strokes) =>
    service.saveMapDrawings(characterId, strokes),
  );
  hook.handlePointerDown({ clientX: 10, clientY: 10 });
  switchCharacter();
  assert.throws(unmount, /角色已切换/);
  assert.equal(writes.length, 0);
});
