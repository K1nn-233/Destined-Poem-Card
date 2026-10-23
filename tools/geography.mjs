import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function generateGeography({
  outputDir = path.join(root, "dist/local/geography"),
} = {}) {
  const source = path.join(root, "content/geography");
  const scripts = path.join(root, "tools/geography/scripts");
  const destination = path.resolve(outputDir);
  if (!destination.startsWith(root + path.sep))
    throw new Error("Geography output must stay inside the workspace");
  const compact = path.join(destination, "compact");
  await fs.mkdir(compact, { recursive: true });
  execFileSync(
    "python",
    [
      "-X",
      "utf8",
      path.join(scripts, "build_compact.py"),
      "--source",
      source,
      "--output",
      compact,
    ],
    { cwd: root, stdio: "pipe" },
  );
  const placeText = await fs.readFile(path.join(compact, "place.yaml"), "utf8");
  const edgeText = await fs.readFile(path.join(compact, "edges.yaml"), "utf8");
  const version =
    "sha256:" +
    createHash("sha256")
      .update(placeText)
      .update(edgeText)
      .digest("hex")
      .slice(0, 16);
  const loaderPath = path.join(destination, "load_compact.js");
  execFileSync(
    "python",
    [
      "-X",
      "utf8",
      path.join(scripts, "generate_tavern_loader.py"),
      "--compact",
      compact,
      "--output",
      loaderPath,
      "--version",
      version,
    ],
    { cwd: root, stdio: "pipe" },
  );
  const places = YAML.parse(placeText).places;
  const edges = YAML.parse(edgeText).edges;
  const rawPlaces = YAML.parse(
    await fs.readFile(path.join(source, "places.yaml"), "utf8"),
  ).places;
  const ids = new Set(places.map((place) => place.id));
  if (ids.size !== places.length)
    throw new Error("Duplicate geography place id");
  for (const edge of edges)
    if (!ids.has(edge.from) || !ids.has(edge.to))
      throw new Error(`Unknown geography endpoint: ${edge.from} -> ${edge.to}`);
  const mapMarkers = rawPlaces
    .filter((place) => place.marker)
    .map((place) => ({ ...place.marker }));
  if (new Set(mapMarkers.map((marker) => marker.id)).size !== mapMarkers.length)
    throw new Error("Duplicate map marker id");
  await fs.writeFile(
    path.join(destination, "map-markers.json"),
    JSON.stringify(mapMarkers, null, 2) + "\n",
  );
  await fs.writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(
      {
        version,
        places: places.length,
        edges: edges.length,
        markers: mapMarkers.length,
        variable: "runtime_geo_compact_data",
        scope: "chat",
      },
      null,
      2,
    ) + "\n",
  );
  return {
    mapMarkers,
    loaderPath,
    version,
    places: places.length,
    edges: edges.length,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await generateGeography();
  console.log(
    JSON.stringify(
      { ...result, mapMarkers: result.mapMarkers.length },
      null,
      2,
    ),
  );
}
