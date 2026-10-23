import fs from "node:fs";

export const releaseManifestPath = new URL(
  "../../release.json",
  import.meta.url,
);
export const releaseManifest = JSON.parse(
  fs.readFileSync(releaseManifestPath, "utf8"),
) as {
  localOrigin: string;
  dependencies: { mvuZod: { url: string } };
};
