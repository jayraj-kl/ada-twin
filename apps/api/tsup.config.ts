import { defineConfig } from "tsup";

export default defineConfig({
  // The server, and the migrations the deploy runs before it.
  entry: ["src/index.ts", "src/migrate.ts"],
  format: "esm",
  target: "node24",
  clean: true,
  // Bundle everything, workspace packages included (they export TypeScript
  // source), so the container runs on dist/ alone with no node_modules.
  noExternal: [/.*/],
  // Bundled CommonJS dependencies call require(), which ESM does not define.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
