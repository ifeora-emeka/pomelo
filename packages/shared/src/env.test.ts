import test from "node:test";
import assert from "node:assert";
import { $env, publicEnv, EnvError } from "./env.js";

test("$env coerces types and applies defaults", () => {
  const env = $env(
    {
      DATABASE_URL: "url",
      PORT: { kind: "port", default: 3000 },
      DEBUG: { kind: "boolean", required: false, default: false },
      WORKERS: "number",
    },
    {
      DATABASE_URL: "https://db.example.com",
      WORKERS: "4",
    },
  );
  assert.strictEqual(env.DATABASE_URL, "https://db.example.com");
  assert.strictEqual(env.PORT, 3000);
  assert.strictEqual(env.DEBUG, false);
  assert.strictEqual(env.WORKERS, 4);
});

test("$env aggregates all issues into one EnvError", () => {
  assert.throws(
    () =>
      $env(
        {
          SECRET: "string",
          PORT: "port",
          API_URL: "url",
        },
        { PORT: "99999", API_URL: "not a url" },
      ),
    (err: unknown) => {
      assert.ok(err instanceof EnvError);
      const keys = err.issues.map((i) => i.key).sort();
      assert.deepStrictEqual(keys, ["API_URL", "PORT", "SECRET"]);
      return true;
    },
  );
});

test("$env boolean parses common truthy/falsy strings", () => {
  const env = $env(
    { A: "boolean", B: "boolean", C: "boolean" },
    { A: "on", B: "0", C: "TRUE" },
  );
  assert.strictEqual(env.A, true);
  assert.strictEqual(env.B, false);
  assert.strictEqual(env.C, true);
});

test("$env enum (values) rejects out-of-set values", () => {
  assert.throws(
    () => $env({ MODE: { values: ["a", "b"] } }, { MODE: "c" }),
    (err: unknown) => err instanceof EnvError,
  );
  const env = $env({ MODE: { values: ["a", "b"] } }, { MODE: "b" });
  assert.strictEqual(env.MODE, "b");
});

test("$env optional without default resolves to undefined", () => {
  const env = $env({ MAYBE: { kind: "string", required: false } }, {});
  assert.strictEqual(env.MAYBE, undefined);
});

test("$env enforces PUBLIC_ prefix for client-exposed vars", () => {
  assert.throws(
    () => $env({ SECRET_KEY: { client: true } }, { SECRET_KEY: "x" }),
    (err: unknown) => {
      assert.ok(err instanceof EnvError);
      assert.match(err.issues[0]!.message, /PUBLIC_ prefix/);
      return true;
    },
  );
});

test("publicEnv extracts only client PUBLIC_ keys", () => {
  const schema = {
    DATABASE_URL: "url",
    PUBLIC_API_BASE: { kind: "url", client: true },
    PUBLIC_FEATURE: { kind: "boolean", client: false },
  } as const;
  const env = $env(schema, {
    DATABASE_URL: "https://db.example.com",
    PUBLIC_API_BASE: "https://api.example.com",
    PUBLIC_FEATURE: "true",
  });
  const pub = publicEnv(env, schema);
  assert.deepStrictEqual(pub, { PUBLIC_API_BASE: "https://api.example.com" });
});
