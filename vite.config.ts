import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import ydkLoader from "vite-ydk-loader";
import tsconfigPaths from "vite-tsconfig-paths";
import sassDts from "vite-plugin-sass-dts";
import path from "path";
import arraybuffer from "vite-plugin-arraybuffer";

// https://vitejs.dev/config/
export default defineConfig({
  worker: { format: "es" },
  optimizeDeps: { entries: ["index.html"] },
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [
    ...(process.env.VITE_DEPLOY_TARGET === "bilitoy"
      ? [
          {
            name: "bilitoy-system-fonts",
            enforce: "pre" as const,
            transform(code: string, id: string) {
              if (!id.replace(/\\/g, "/").endsWith("/src/styles/core.scss"))
                return;
              return {
                code: code.replace(
                  /^@import url\("https:\/\/fonts\.font\.im\/[^"\n]+"\);\r?\n?/m,
                  "",
                ),
                map: null,
              };
            },
          },
        ]
      : []),
    react(),
    svgr(),
    ydkLoader(),
    arraybuffer(),
    // Test runtimes contain copies of the server and Lua assets. Avoid scanning
    // those trees for unrelated tsconfigs during every browser test/build.
    tsconfigPaths({ projects: [path.resolve(__dirname, "tsconfig.json")] }),
    sassDts({
      enabledMode: ["development"],
      sourceDir: path.resolve(__dirname, "./src"),
    }),
  ],
  resolve: {
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json", ".ydk"],
  },
});
