import { build } from "esbuild";

await build({
  entryPoints: ["dist/client.js"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  outfile: "dist/client.js",
  allowOverwrite: true,
});
