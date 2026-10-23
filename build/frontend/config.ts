import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
import type webpack from "webpack";
import { frontendRoot, type Entry } from "./entries.ts";
import { externals } from "./externals.ts";
import { createOptimization } from "./optimization.ts";
import { createPlugins } from "./plugins.ts";
import { createRules } from "./rules.ts";
import { releaseManifestPath } from "./release.ts";

export function createConfiguration(
  entry: Entry,
  argv: { mode?: string },
): webpack.Configuration {
  const production = argv.mode === "production";
  return {
    name: entry.name,
    context: frontendRoot,
    experiments: { outputModule: true },
    performance: {
      hints: production ? "warning" : false,
      maxAssetSize: 1024 * 1024,
      maxEntrypointSize: 1024 * 1024,
    },
    devtool: production ? "hidden-source-map" : "eval-source-map",
    cache: {
      type: "filesystem",
      name: entry.name,
      buildDependencies: {
        config: [
          path.join(frontendRoot, "webpack.config.ts"),
          fileURLToPath(releaseManifestPath),
          ...fs
            .readdirSync(fileURLToPath(new URL(".", import.meta.url)))
            .filter((file) => file.endsWith(".ts"))
            .map((file) => fileURLToPath(new URL(file, import.meta.url))),
          path.join(frontendRoot, "package.json"),
          path.join(frontendRoot, "tsconfig.base.json"),
          path.join(frontendRoot, "postcss.config.cjs"),
          entry.tsconfig,
        ],
      },
    },
    watchOptions: { ignored: ["**/dist", "**/node_modules"] },
    entry: entry.script,
    target: "browserslist",
    output: {
      devtoolNamespace: `destiny/${entry.name}`,
      filename: "index.js",
      path: path.join(frontendRoot, "dist", entry.name),
      chunkFilename: "index.[contenthash].chunk.js",
      asyncChunks: true,
      clean: true,
      publicPath: "",
      library: { type: "module" },
    },
    module: { rules: createRules(entry) },
    resolve: {
      extensions: [".ts", ".js", ".tsx", ".jsx", ".css"],
      plugins: [
        new TsconfigPathsPlugin({
          extensions: [".ts", ".js", ".tsx", ".jsx"],
          configFile: path.join(frontendRoot, "tsconfig.json"),
        }),
      ],
    },
    plugins: createPlugins(entry, production),
    optimization: createOptimization(argv),
    externals,
  };
}
