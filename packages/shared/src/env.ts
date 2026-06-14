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

export type EnvKind = "string" | "number" | "boolean" | "url" | "port";

export interface EnvVarSpec {
  kind?: EnvKind;
  required?: boolean;
  default?: string | number | boolean;
  values?: readonly string[];
  client?: boolean;
}

export type EnvSchema = Record<string, EnvKind | EnvVarSpec>;

type KindOf<T> = T extends EnvKind
  ? T
  : T extends { kind: infer K }
    ? K extends EnvKind
      ? K
      : "string"
    : "string";

type ValueOfKind<K> = K extends "number" | "port"
  ? number
  : K extends "boolean"
    ? boolean
    : string;

type IsOptional<T> = T extends { required: false }
  ? T extends { default: unknown }
    ? false
    : true
  : false;

export type ResolvedEnv<S extends EnvSchema> = {
  [K in keyof S]: IsOptional<S[K]> extends true
    ? ValueOfKind<KindOf<S[K]>> | undefined
    : ValueOfKind<KindOf<S[K]>>;
};

export class EnvError extends Error {
  issues: Array<{ key: string; message: string }>;
  constructor(issues: Array<{ key: string; message: string }>) {
    super(
      "Invalid environment configuration:\n" +
        issues.map((i) => `  - ${i.key}: ${i.message}`).join("\n"),
    );
    this.name = "EnvError";
    this.issues = issues;
  }
}

export const PUBLIC_ENV_PREFIX = "PUBLIC_";

function normalizeSpec(spec: EnvKind | EnvVarSpec): Required<
  Pick<EnvVarSpec, "kind" | "required" | "client">
> &
  EnvVarSpec {
  if (typeof spec === "string") {
    return { kind: spec, required: true, client: false };
  }
  return {
    kind: spec.kind ?? "string",
    required: spec.required ?? true,
    client: spec.client ?? false,
    default: spec.default,
    values: spec.values,
  };
}

function coerce(
  key: string,
  raw: string,
  spec: ReturnType<typeof normalizeSpec>,
): { value?: string | number | boolean; error?: string } {
  switch (spec.kind) {
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { error: `expected a number, got "${raw}"` };
      return { value: n };
    }
    case "port": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        return { error: `expected a port (0-65535), got "${raw}"` };
      }
      return { value: n };
    }
    case "boolean": {
      const v = raw.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(v)) return { value: true };
      if (["0", "false", "no", "off", ""].includes(v)) return { value: false };
      return { error: `expected a boolean, got "${raw}"` };
    }
    case "url": {
      try {
        new URL(raw);
        return { value: raw };
      } catch {
        return { error: `expected a valid URL, got "${raw}"` };
      }
    }
    default: {
      if (spec.values && !spec.values.includes(raw)) {
        return { error: `expected one of ${spec.values.join(", ")}, got "${raw}"` };
      }
      return { value: raw };
    }
  }
}

/**
 * $env — validates and coerces environment variables against a schema, returning
 * a typed object. Throws an aggregated EnvError listing every problem at once so
 * misconfiguration fails fast at boot. Keys marked `client: true` are exposed to
 * the browser and must use the PUBLIC_ prefix so secrets never leak to the bundle.
 *
 * Usage:
 *   const env = $env({
 *     DATABASE_URL: "url",
 *     PORT: { kind: "port", default: 3000 },
 *     PUBLIC_API_BASE: { kind: "url", client: true },
 *   });
 */
export function $env<S extends EnvSchema>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): ResolvedEnv<S> {
  const out: Record<string, string | number | boolean | undefined> = {};
  const issues: Array<{ key: string; message: string }> = [];

  for (const key of Object.keys(schema)) {
    const spec = normalizeSpec(schema[key]!);

    if (spec.client && !key.startsWith(PUBLIC_ENV_PREFIX)) {
      issues.push({
        key,
        message: `client-exposed vars must use the ${PUBLIC_ENV_PREFIX} prefix`,
      });
      continue;
    }

    const raw = source[key];
    if (raw === undefined || raw === "") {
      if (spec.default !== undefined) {
        out[key] = spec.default;
      } else if (spec.required) {
        issues.push({ key, message: "is required but missing" });
      } else {
        out[key] = undefined;
      }
      continue;
    }

    const { value, error } = coerce(key, raw, spec);
    if (error) {
      issues.push({ key, message: error });
    } else {
      out[key] = value;
    }
  }

  if (issues.length > 0) {
    throw new EnvError(issues);
  }

  return out as ResolvedEnv<S>;
}

/**
 * publicEnv — extracts only the client-safe (PUBLIC_-prefixed, `client: true`)
 * keys from a resolved env, ready to serialize into the browser bundle.
 */
export function publicEnv<S extends EnvSchema>(
  resolved: ResolvedEnv<S>,
  schema: S,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(schema)) {
    const spec = normalizeSpec(schema[key]!);
    const value = (resolved as Record<string, unknown>)[key];
    if (spec.client && key.startsWith(PUBLIC_ENV_PREFIX) && value !== undefined) {
      out[key] = value as string | number | boolean;
    }
  }
  return out;
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
  const endServerBlockMarker = "// === End Server Block ===";
  const clientBlockMarker = "// === Client Block ===";

  const serverIndex = code.indexOf(serverBlockMarker);
  if (serverIndex === -1) return code;

  const endIndex = code.indexOf(endServerBlockMarker);
  if (endIndex !== -1) {
    return code.slice(0, serverIndex) + code.slice(endIndex + endServerBlockMarker.length);
  }

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
