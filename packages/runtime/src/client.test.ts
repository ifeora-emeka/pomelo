import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("client bundle is self-contained (no unresolvable imports for the browser)", () => {
  const bundlePath = fileURLToPath(new URL("./client.js", import.meta.url));
  const code = readFileSync(bundlePath, "utf-8");

  const importFrom =
    /\b(?:import|export)\b[\s\S]*?\bfrom\s*["']([^"']+)["']/g;
  const offenders: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importFrom.exec(code)) !== null) {
    const spec = match[1];
    if (!spec) continue;
    const isRelative =
      spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/");
    if (!isRelative) offenders.push(spec);
  }

  assert.deepStrictEqual(
    offenders,
    [],
    `client bundle must not import bare/node specifiers; found: ${offenders.join(", ")}`,
  );
});
