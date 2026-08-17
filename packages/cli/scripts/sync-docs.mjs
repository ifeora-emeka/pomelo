// Copies the documentation (apps/docs) into the CLI's dist so it ships with the
// published package. `kallo create` then writes these into a scaffolded app's
// .agents/kallo-docs/ directory, giving developers and AI agents local docs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const docsSrc = path.resolve(here, "../../../apps/docs");
const docsDest = path.resolve(here, "../dist/kallo-docs");

if (!fs.existsSync(docsSrc)) {
  console.warn(`[sync-docs] apps/docs not found at ${docsSrc}; skipping.`);
  process.exit(0);
}

fs.rmSync(docsDest, { recursive: true, force: true });
fs.mkdirSync(docsDest, { recursive: true });

let count = 0;
for (const entry of fs.readdirSync(docsSrc)) {
  if (!entry.endsWith(".md")) continue;
  fs.copyFileSync(path.join(docsSrc, entry), path.join(docsDest, entry));
  count++;
}
console.log(`[sync-docs] copied ${count} docs into dist/kallo-docs`);
