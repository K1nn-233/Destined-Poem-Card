import MiniCssExtractPlugin from "mini-css-extract-plugin";
import RemarkHTML from "remark-html";
import type webpack from "webpack";
import type { Entry } from "./entries.ts";

/** ts-loader 公共配置 */
const TsLoaderOptions = {
  transpileOnly: true,
  onlyCompileBundledFiles: true,
  compilerOptions: {
    noUnusedLocals: false,
    noUnusedParameters: false,
  },
};

function createTsLoaderOptions(entry: Entry) {
  return {
    ...TsLoaderOptions,
    instance: entry.script,
    configFile: entry.tsconfig,
  };
}

/** css-loader 基础配置 */
const CssLoaderOptionsBase = { url: false } as const;

/** css-loader 模块化配置 */
const CssLoaderOptionsModules = {
  url: false,
  esModule: false,
  modules: {
    localIdentName: "[name]__[local]--[hash:base64:5]",
    namedExport: false,
  },
} as const;

/** 通用排除规则 */
const ExcludeNodeModules = /node_modules/;

// 规则生成工厂函数
type AssetType = "asset/source" | "asset/inline";

interface ResourceQueryRuleOptions {
  entry: Entry;
  resourceQuery: RegExp;
  type: AssetType;
}

/**
 * 生成带 resourceQuery 的规则集
 * @description 用于 ?raw 和 ?url 导入的统一处理
 */
function createResourceQueryRules({
  entry,
  resourceQuery,
  type,
}: ResourceQueryRuleOptions): webpack.RuleSetRule[] {
  return [
    {
      test: /\.tsx?$/,
      loader: "ts-loader",
      options: createTsLoaderOptions(entry),
      resourceQuery,
      type,
      exclude: ExcludeNodeModules,
    },
    {
      test: /\.(sa|sc)ss$/,
      use: ["postcss-loader", "sass-loader"],
      resourceQuery,
      type,
      exclude: ExcludeNodeModules,
    },
    {
      test: /\.css$/,
      use: ["postcss-loader"],
      resourceQuery,
      type,
      exclude: ExcludeNodeModules,
    },
    {
      resourceQuery,
      type,
      exclude: ExcludeNodeModules,
    },
  ];
}

/**
 * 生成无 HTML 入口时的样式规则
 * @description 使用 vue-style-loader 和 style-loader
 */
function createNoHtmlStyleRules(): webpack.RuleSetRule[] {
  return [
    {
      test: /\.vue\.s(a|c)ss$/,
      use: [
        { loader: "vue-style-loader", options: { ssrId: true } },
        { loader: "css-loader", options: CssLoaderOptionsBase },
        "postcss-loader",
        "sass-loader",
      ],
      exclude: ExcludeNodeModules,
    },
    {
      test: /\.vue\.css$/,
      use: [
        { loader: "vue-style-loader", options: { ssrId: true } },
        { loader: "css-loader", options: CssLoaderOptionsBase },
        "postcss-loader",
      ],
      exclude: ExcludeNodeModules,
    },
    {
      test: /\.s(a|c)ss$/,
      use: [
        "style-loader",
        { loader: "css-loader", options: CssLoaderOptionsBase },
        "postcss-loader",
        "sass-loader",
      ],
      exclude: ExcludeNodeModules,
    },
    {
      test: /\.css$/,
      use: [
        "style-loader",
        { loader: "css-loader", options: CssLoaderOptionsBase },
        "postcss-loader",
      ],
      exclude: ExcludeNodeModules,
    },
  ];
}

/**
 * 生成有 HTML 入口时的样式规则
 * @description 使用 MiniCssExtractPlugin.loader 提取 CSS
 */
function createHtmlStyleRules(): webpack.RuleSetRule[] {
  return [
    {
      test: /\.module\.s(a|c)ss$/,
      use: [
        MiniCssExtractPlugin.loader,
        { loader: "css-loader", options: CssLoaderOptionsModules },
        "postcss-loader",
        "sass-loader",
      ],
      exclude: ExcludeNodeModules,
    },
    {
      test: /\.s(a|c)ss$/,
      use: [
        MiniCssExtractPlugin.loader,
        { loader: "css-loader", options: CssLoaderOptionsBase },
        "postcss-loader",
        "sass-loader",
      ],
      exclude: [ExcludeNodeModules, /\.module\.s(a|c)ss$/],
    },
    {
      test: /\.module\.css$/,
      use: [
        MiniCssExtractPlugin.loader,
        { loader: "css-loader", options: CssLoaderOptionsModules },
        "postcss-loader",
      ],
      exclude: ExcludeNodeModules,
    },
    {
      test: /\.css$/,
      use: [
        MiniCssExtractPlugin.loader,
        { loader: "css-loader", options: CssLoaderOptionsBase },
        "postcss-loader",
      ],
      exclude: [ExcludeNodeModules, /\.module\.css$/],
    },
  ];
}

export function createRules(entry: Entry): webpack.RuleSetRule[] {
  return [
    {
      test: /\.vue$/,
      use: "vue-loader",
      exclude: ExcludeNodeModules,
    },
    {
      oneOf: [
        // ?raw 导入规则
        ...createResourceQueryRules({
          entry,
          resourceQuery: /raw/,
          type: "asset/source",
        }),
        // ?url 导入规则
        ...createResourceQueryRules({
          entry,
          resourceQuery: /url/,
          type: "asset/inline",
        }),
        // TypeScript 默认规则
        {
          test: /\.tsx?$/,
          loader: "ts-loader",
          options: createTsLoaderOptions(entry),
          exclude: ExcludeNodeModules,
        },
        // HTML 规则
        {
          test: /\.html$/,
          use: "html-loader",
          exclude: ExcludeNodeModules,
        },
        // Markdown 规则
        {
          test: /\.md$/,
          use: [
            { loader: "html-loader" },
            {
              loader: "remark-loader",
              options: {
                remarkOptions: {
                  plugins: [RemarkHTML],
                },
              },
            },
          ],
        },
        // 样式规则 (DRY: 使用工厂函数)
        ...(entry.html === undefined
          ? createNoHtmlStyleRules()
          : createHtmlStyleRules()),
      ],
    },
  ];
}
