import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // Bundle deps into the single file so `serenedge` runs with no node_modules.
  noExternal: [/.*/],
  banner: { js: "#!/usr/bin/env node" },
});
