import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
};

const entryPoints = [
  { entryPoints: ["src/cli.ts"], outfile: "dist/workctl.mjs" },
  { entryPoints: ["src/daemon/index.ts"], outfile: "dist/workctld.mjs" },
];

const isWatch = process.argv.includes("--watch");

if (isWatch) {
  for (const entry of entryPoints) {
    const ctx = await context({ ...shared, ...entry });
    await ctx.watch();
  }
  console.log("Watching for changes...");
} else {
  for (const entry of entryPoints) {
    await build({ ...shared, ...entry });
  }
  mkdirSync("dist/manifests", { recursive: true });
  cpSync("src/adapters/manifests", "dist/manifests", { recursive: true });
  mkdirSync("dist/hooks/cursor", { recursive: true });
  cpSync("src/hooks/cursor", "dist/hooks/cursor", { recursive: true });
  console.log("Build complete.");
}
