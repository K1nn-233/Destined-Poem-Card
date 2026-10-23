import fs from "node:fs";
import path from "node:path";
import HTMLInlineCSSWebpackPluginModule from "html-inline-css-webpack-plugin";
import HtmlInlineScriptWebpackPlugin from "html-inline-script-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import unpluginAutoImport from "unplugin-auto-import/webpack";
import {
  VueUseComponentsResolver,
  VueUseDirectiveResolver,
} from "unplugin-vue-components/resolvers";
import unpluginVueComponents from "unplugin-vue-components/webpack";
import { VueLoaderPlugin } from "vue-loader";
import webpack from "webpack";
import WebpackObfuscator from "webpack-obfuscator";
import { frontendRoot, type Entry } from "./entries.ts";
import { watchUpdates } from "./watch.ts";
import { releaseManifest } from "./release.ts";

const HTMLInlineCSSWebpackPlugin =
  (HTMLInlineCSSWebpackPluginModule as any).default ||
  HTMLInlineCSSWebpackPluginModule;
export function createPlugins(
  entry: Entry,
  production: boolean,
): webpack.WebpackPluginInstance[] {
  const sourceDirectory = entry.directory.replaceAll("\\", "/");
  const escapedDirectory = sourceDirectory.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  const plugins: webpack.WebpackPluginInstance[] = [
    ...(entry.html
      ? [
          new HtmlWebpackPlugin({
            template: entry.html,
            filename: "index.html",
            scriptLoading: "module",
            cache: false,
          }),
          new HtmlInlineScriptWebpackPlugin(),
          new HTMLInlineCSSWebpackPlugin({
            styleTagFactory: ({ style }: { style: string }) =>
              `<style>${style}</style>`,
          }),
        ]
      : []),
    new MiniCssExtractPlugin(),
    { apply: watchUpdates },
    new VueLoaderPlugin(),
    unpluginAutoImport({
      dts: production
        ? false
        : path.join(frontendRoot, ".cache", `${entry.name}.auto-imports.d.ts`),
      dtsMode: "overwrite",
      include: [
        new RegExp(`${escapedDirectory}/.*\\.(?:[tj]sx?|vue)(?:\\?.*)?$`),
        /[/\\]src[/\\]shared[/\\].*\.(?:[tj]sx?|vue)(?:\?.*)?$/,
      ],
      imports: [
        "vue",
        "pinia",
        "@vueuse/core",
        { from: "dedent", imports: [["default", "dedent"]] },
        { from: "klona", imports: ["klona"] },
        { from: "vue-final-modal", imports: ["useModal"] },
        { from: "zod", imports: ["z"] },
      ],
    }),
    unpluginVueComponents({
      dts: production
        ? false
        : path.join(frontendRoot, ".cache", `${entry.name}.components.d.ts`),
      syncMode: "overwrite",
      globs: [
        `${sourceDirectory}/**/*.vue`,
        `${frontendRoot.replaceAll("\\", "/")}src/shared/**/*.vue`,
      ],
      resolvers: [VueUseComponentsResolver(), VueUseDirectiveResolver()],
    }),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    new webpack.DefinePlugin({
      __VUE_OPTIONS_API__: false,
      __VUE_PROD_DEVTOOLS__: process.env.CI !== "true",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
      __APP_VERSION__: JSON.stringify(
        JSON.parse(
          fs.readFileSync(path.join(frontendRoot, "package.json"), "utf8"),
        ).version,
      ),
      __DESTINY_ASSET_BASE__: JSON.stringify(
        (
          process.env.DESTINY_ASSET_BASE ||
          `${releaseManifest.localOrigin}/dist/local/frontend`
        ).replace(/\/$/, ""),
      ),
    }),
  ];
  if (fs.readFileSync(entry.script, "utf8").includes("@obfuscate")) {
    plugins.push(
      new WebpackObfuscator({
        controlFlowFlattening: true,
        numbersToExpressions: true,
        selfDefending: true,
        simplify: true,
        splitStrings: true,
        seed: 1,
      }),
    );
  }
  return plugins;
}
