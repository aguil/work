import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { build, context } from "esbuild";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const version = pkg.version;

const isWatch = process.argv.includes("--watch");
const isProduction = process.argv.includes("--production");

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: !isProduction,
  define: {
    __WORK_VERSION__: JSON.stringify(version),
  },
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
};

const entryPoints = [
  { entryPoints: ["src/cli.ts"], outfile: "dist/work.mjs" },
  { entryPoints: ["src/daemon/index.ts"], outfile: "dist/workd.mjs" },
];

function copyBundledAssets() {
  mkdirSync("dist/manifests", { recursive: true });
  cpSync("src/adapters/manifests", "dist/manifests", { recursive: true });
  mkdirSync("dist/hooks/cursor", { recursive: true });
  cpSync("src/hooks/cursor", "dist/hooks/cursor", { recursive: true });
  mkdirSync("dist/hooks/claude", { recursive: true });
  cpSync("src/hooks/claude", "dist/hooks/claude", { recursive: true });
}

if (isWatch) {
  for (const entry of entryPoints) {
    const ctx = await context({ ...shared, ...entry });
    await ctx.watch();
  }
  console.log("Watching for changes...");
} else {
  rmSync("dist", { recursive: true, force: true });
  mkdirSync("dist", { recursive: true });

  for (const entry of entryPoints) {
    await build({ ...shared, ...entry });
    chmodSync(entry.outfile, 0o755);
  }
  copyBundledAssets();
  console.log(
    `Build complete (${version}${isProduction ? ", production" : ""}).`,
  );
}
