import fs from "node:fs";
import path from "node:path";
import type webpack from "webpack";
import { releaseManifest } from "./release.ts";

const globals: Record<string, string> = {
  jquery: "$",
  lodash: "_",
  showdown: "showdown",
  toastr: "toastr",
  vue: "Vue",
  "vue-router": "VueRouter",
  yaml: "YAML",
  zod: "z",
};

// Exact versions preserved from the original frontend lockfile. Unknown imports are bundled
// so workspace code and undeclared dependencies can never silently become CDN imports.
const cdnPackages: Record<string, string> = {
  "async-wait-until": "2.0.31",
  "compare-versions": "6.1.1",
  dedent: "1.7.2",
  glob: "13.0.6",
  gsap: "3.15.0",
  immer: "11.1.8",
  jqueryui: "1.11.1",
  json5: "2.2.3",
  jsonrepair: "3.14.0",
  klona: "2.0.6",
  openseadragon: "6.0.2",
  "pixi.js": "8.19.0",
  sass: "1.101.0",
};

export const externals: webpack.ExternalItem = (
  { context, request },
  callback,
) => {
  if (request === "@tavern-host/mvu-zod")
    return callback(
      null,
      `module-import ${releaseManifest.dependencies.mvuZod.url}`,
    );
  if (!context || !request || request.startsWith("@destiny/"))
    return callback();
  if (request.startsWith("http"))
    return callback(null, `module-import ${request}`);
  if (
    /^[-./!]/.test(request) ||
    request.startsWith("@/") ||
    path.isAbsolute(request) ||
    fs.existsSync(path.join(context, request))
  )
    return callback();
  if (request in globals) return callback(null, `var ${globals[request]}`);
  const segments = request.split("/");
  const packageName = request.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
  const version = cdnPackages[packageName];
  if (!version) return callback();
  const suffix = request.slice(packageName.length);
  return callback(
    null,
    `module-import https://testingcf.jsdelivr.net/npm/${packageName}@${version}${suffix}/+esm`,
  );
};
