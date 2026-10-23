import { resolve } from "node:path";
import { defineConfig } from "vite";

const packageRoot = resolve(import.meta.dirname, "../../packages/automation");
// Only this actual external import uses npm CDN; workspace source is always bundled.
const externalUrls: Record<string, string> = {
  klona: "https://testingcf.jsdelivr.net/npm/klona@2.0.6/+esm",
};

export default defineConfig(({ mode }) => ({
  root: packageRoot,
  resolve: { alias: { "@": resolve(packageRoot, "src") } },
  build: {
    outDir: resolve(packageRoot, "dist"),
    emptyOutDir: true,
    lib: {
      entry: resolve(packageRoot, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: (id) => id in externalUrls,
      output: { paths: externalUrls },
    },
    minify: "terser",
    terserOptions: { mangle: { properties: false } },
    sourcemap: mode === "production" ? "hidden" : true,
  },
}));
