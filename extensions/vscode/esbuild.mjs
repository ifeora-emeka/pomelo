import { build, context } from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
  external: ["vscode"],
};

const targets = [
  {
    ...shared,
    entryPoints: ["client/src/extension.ts"],
    outfile: "dist/client.js",
  },
  {
    ...shared,
    entryPoints: ["server/src/server.ts"],
    outfile: "dist/server.js",
  },
];

if (watch) {
  const contexts = await Promise.all(targets.map((t) => context(t)));
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all(targets.map((t) => build(t)));
}
