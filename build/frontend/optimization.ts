import TerserPlugin from "terser-webpack-plugin";
import type webpack from "webpack";

export function createOptimization(argv: {
  mode?: string;
}): webpack.Configuration["optimization"] {
  return {
    minimize: true,
    minimizer: [
      argv.mode === "production"
        ? new TerserPlugin({
            terserOptions: {
              format: { quote_style: 1 },
              mangle: { reserved: ["_", "toastr", "YAML", "$", "z"] },
            },
          })
        : new TerserPlugin({
            extractComments: false,
            terserOptions: {
              format: { beautify: true, indent_level: 2 },
              compress: false,
              mangle: false,
            },
          }),
    ],
    splitChunks: false,
  };
}
