import fs from "node:fs";
import path from "node:path";

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let val = trimmed.slice(index + 1).trim();

    // Strip quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    result[key] = val;
  }

  return result;
}

export function loadEnv(mode?: string): void {
  const finalMode =
    mode ||
    process.env.KALLO_ENV ||
    process.env.NODE_ENV ||
    "development";

  const cwd = process.cwd();

  // Low to high priority env files
  const files = [
    path.join(cwd, ".env"),
    path.join(cwd, "env"),
    path.join(cwd, `${finalMode}.env`),
    path.join(cwd, `.env.${finalMode}`),
  ];

  if (finalMode !== "test") {
    files.push(path.join(cwd, "local.env"));
    files.push(path.join(cwd, ".env.local"));
  }

  files.push(path.join(cwd, `.env.${finalMode}.local`));

  const merged: Record<string, string> = {};
  for (const file of files) {
    if (fs.existsSync(file)) {
      const parsed = parseEnvFile(file);
      Object.assign(merged, parsed);
    }
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function replaceEnvVars(content: string): string {
  return content.replace(/process\.env\.([a-zA-Z0-9_]+)/g, (match, name) => {
    if (name.startsWith("KALLO_PUBLIC_")) {
      return JSON.stringify(process.env[name] || "");
    }
    if (name === "NODE_ENV" || name === "KALLO_ENV") {
      return JSON.stringify(process.env[name] || "development");
    }
    return "undefined";
  });
}

export function stripServerBlock(code: string): string {
  const serverBlockMarker = "// === Server Block ===";
  const clientBlockMarker = "// === Client Block ===";

  const serverIndex = code.indexOf(serverBlockMarker);
  if (serverIndex === -1) return code;

  const clientIndex = code.indexOf(clientBlockMarker);
  if (clientIndex !== -1) {
    return code.slice(0, serverIndex) + code.slice(clientIndex);
  }

  const renderIndex = code.indexOf("export function render");
  if (renderIndex !== -1) {
    return code.slice(0, serverIndex) + code.slice(renderIndex);
  }

  const cssIndex = code.indexOf("export const css");
  if (cssIndex !== -1) {
    return code.slice(0, serverIndex) + code.slice(cssIndex);
  }

  return "";
}
