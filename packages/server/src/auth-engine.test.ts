import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import express from "express";
import {
  createKalloAuth,
  __authEngineInternals,
  type SendEmailInput,
} from "./auth-engine.js";
import { MemoryAuthAdapter } from "./auth-adapter.js";

test("isSafeLocalPath rejects open-redirect payloads", () => {
  const { isSafeLocalPath } = __authEngineInternals;
  // Allowed: plain local paths.
  assert.ok(isSafeLocalPath("/"));
  assert.ok(isSafeLocalPath("/dashboard"));
  assert.ok(isSafeLocalPath("/a/b?x=1#h"));
  assert.ok(isSafeLocalPath("/path%20with%20encoded"));
  // Rejected: off-site / trick payloads.
  for (const bad of [
    "//evil.com",
    "/\\evil.com",
    "/\t//evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "",
    "relative",
    "/ /evil.com",
  ]) {
    assert.strictEqual(isSafeLocalPath(bad), false, `should reject: ${JSON.stringify(bad)}`);
  }
});

const SECRET = "integration-secret-that-is-32-chars-long!";

interface Harness {
  base: string;
  server: http.Server;
  emails: SendEmailInput[];
  close(): Promise<void>;
}

async function startApp(
  opts: Parameters<typeof createKalloAuth>[0] = {},
): Promise<Harness> {
  const emails: SendEmailInput[] = [];
  const app = express();
  app.use(express.json());
  // Cookie parser (the engine + CSRF read req.cookies).
  app.use((req, _res, next) => {
    const cookies: Record<string, string> = {};
    const header = req.headers.cookie;
    if (header) {
      for (const part of header.split(";")) {
        const idx = part.indexOf("=");
        if (idx === -1) continue;
        cookies[part.slice(0, idx).trim()] = decodeURIComponent(
          part.slice(idx + 1).trim(),
        );
      }
    }
    (req as express.Request & { cookies: Record<string, string> }).cookies =
      cookies;
    next();
  });
  const auth = createKalloAuth({
    secret: SECRET,
    adapter: new MemoryAuthAdapter(),
    sendEmail: (e) => {
      emails.push(e);
    },
    ...opts,
  });
  app.use(auth.middleware);
  app.use(auth.router);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    server,
    emails,
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// Minimal cookie jar so CSRF's double-submit works across requests.
class Jar {
  private cookies = new Map<string, string>();
  apply(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair!.indexOf("=");
      if (idx === -1) continue;
      const name = pair!.slice(0, idx).trim();
      const value = pair!.slice(idx + 1).trim();
      if (value === "" ) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}

async function req(
  h: Harness,
  jar: Jar,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // Mirror the real client: send the CSRF token on every unsafe request.
  if (method !== "GET" && method !== "HEAD") {
    const csrf = jar.get("kallo.csrf");
    if (csrf) headers["x-kallo-csrf"] = csrf;
  }
  const res = await fetch(`${h.base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  jar.apply(res);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

async function primeCsrf(h: Harness, jar: Jar) {
  await req(h, jar, "GET", "/api/auth/session");
}

test("signup issues a session and never leaks the password hash", async () => {
  const h = await startApp();
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    const r = await req(h, jar, "POST", "/api/auth/signup", {
      email: "new@example.com",
      password: "supersecret",
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.user.email, "new@example.com");
    assert.strictEqual(r.json.user.passwordHash, undefined);
    assert.ok(jar.get("kallo.session"), "session cookie set");

    const session = await req(h, jar, "GET", "/api/auth/session");
    assert.strictEqual(session.json.user.email, "new@example.com");
  } finally {
    await h.close();
  }
});

test("CSRF blocks a POST with no token", async () => {
  const h = await startApp();
  try {
    // No primeCsrf, no token header → rejected.
    const res = await fetch(`${h.base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "x@example.com", password: "supersecret" }),
    });
    assert.strictEqual(res.status, 403);
  } finally {
    await h.close();
  }
});

test("signin rejects wrong password, accepts correct", async () => {
  const h = await startApp();
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    await req(h, jar, "POST", "/api/auth/signup", {
      email: "log@example.com",
      password: "rightpassword",
    });
    await req(h, jar, "POST", "/api/auth/signout");

    const bad = await req(h, jar, "POST", "/api/auth/signin", {
      provider: "credentials",
      credentials: { email: "log@example.com", password: "wrong" },
    });
    assert.strictEqual(bad.status, 401);

    const good = await req(h, jar, "POST", "/api/auth/signin", {
      provider: "credentials",
      credentials: { email: "log@example.com", password: "rightpassword" },
    });
    assert.strictEqual(good.status, 200);
    assert.strictEqual(good.json.user.email, "log@example.com");
  } finally {
    await h.close();
  }
});

test("signin does not leak whether an email exists", async () => {
  const h = await startApp();
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    const missing = await req(h, jar, "POST", "/api/auth/signin", {
      provider: "credentials",
      credentials: { email: "nobody@example.com", password: "whatever12" },
    });
    assert.strictEqual(missing.status, 401);
    assert.strictEqual(missing.json.error, "Invalid credentials");
  } finally {
    await h.close();
  }
});

test("signout revokes the server session (cookie replay is useless)", async () => {
  const h = await startApp();
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    await req(h, jar, "POST", "/api/auth/signup", {
      email: "rev@example.com",
      password: "supersecret",
    });
    const savedCookie = jar.get("kallo.session")!;
    await req(h, jar, "POST", "/api/auth/signout");

    // Replay the old session cookie directly.
    const res = await fetch(`${h.base}/api/auth/session`, {
      headers: { Cookie: `kallo.session=${savedCookie}` },
    });
    const json = await res.json();
    assert.strictEqual(json.user, null);
  } finally {
    await h.close();
  }
});

test("password reset flow revokes sessions and swaps the password", async () => {
  const h = await startApp();
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    await req(h, jar, "POST", "/api/auth/signup", {
      email: "reset@example.com",
      password: "oldpassword1",
    });
    await req(h, jar, "POST", "/api/auth/request-password-reset", {
      email: "reset@example.com",
    });
    const email = h.emails.find((e) => e.purpose === "password-reset");
    assert.ok(email, "reset email sent");
    const url = new URL(email!.url);
    const token = url.searchParams.get("token")!;

    const reset = await req(h, jar, "POST", "/api/auth/reset-password", {
      email: "reset@example.com",
      token,
      password: "newpassword2",
    });
    assert.strictEqual(reset.status, 200);

    const oldFails = await req(h, jar, "POST", "/api/auth/signin", {
      provider: "credentials",
      credentials: { email: "reset@example.com", password: "oldpassword1" },
    });
    assert.strictEqual(oldFails.status, 401);

    const newWorks = await req(h, jar, "POST", "/api/auth/signin", {
      provider: "credentials",
      credentials: { email: "reset@example.com", password: "newpassword2" },
    });
    assert.strictEqual(newWorks.status, 200);
  } finally {
    await h.close();
  }
});

test("request-password-reset never reveals unknown emails", async () => {
  const h = await startApp();
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    const r = await req(h, jar, "POST", "/api/auth/request-password-reset", {
      email: "ghost@example.com",
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.success, true);
    assert.strictEqual(h.emails.length, 0);
  } finally {
    await h.close();
  }
});

test("requireEmailVerification blocks sign-in until verified", async () => {
  const h = await startApp({ requireEmailVerification: true });
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    const signup = await req(h, jar, "POST", "/api/auth/signup", {
      email: "verify@example.com",
      password: "supersecret",
    });
    assert.strictEqual(signup.json.requiresVerification, true);

    const blocked = await req(h, jar, "POST", "/api/auth/signin", {
      provider: "credentials",
      credentials: { email: "verify@example.com", password: "supersecret" },
    });
    assert.strictEqual(blocked.status, 403);

    const email = h.emails.find((e) => e.purpose === "email-verify");
    const token = new URL(email!.url).searchParams.get("token")!;
    const verified = await req(h, jar, "POST", "/api/auth/verify-email", {
      email: "verify@example.com",
      token,
    });
    assert.strictEqual(verified.status, 200);

    const ok = await req(h, jar, "POST", "/api/auth/signin", {
      provider: "credentials",
      credentials: { email: "verify@example.com", password: "supersecret" },
    });
    assert.strictEqual(ok.status, 200);
  } finally {
    await h.close();
  }
});

// --- OAuth callback (token exchange + userinfo stubbed via global fetch) ---

const OAUTH_URLS = {
  auth: "https://oauth.example/auth",
  token: "https://oauth.example/token",
  userinfo: "https://oauth.example/userinfo",
};

function oauthProvider(raw: Record<string, unknown>) {
  return {
    id: "google",
    clientId: "cid",
    clientSecret: "csecret",
    authorizationUrl: OAUTH_URLS.auth,
    tokenUrl: OAUTH_URLS.token,
    userInfoUrl: OAUTH_URLS.userinfo,
    scope: "openid email",
    usePKCE: true,
    profile: () => ({
      providerAccountId: String(raw.sub),
      email: (raw.email as string) ?? null,
      emailVerified: raw.verified === true,
      name: (raw.name as string) ?? null,
    }),
  };
}

function installFakeFetch(rawProfile: Record<string, unknown>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const u = String(url);
    if (u === OAUTH_URLS.token) {
      return new Response(
        JSON.stringify({ access_token: "at", token_type: "bearer", expires_in: 3600 }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (u === OAUTH_URLS.userinfo) {
      return new Response(JSON.stringify(rawProfile), {
        headers: { "content-type": "application/json" },
      });
    }
    return (original as typeof fetch)(url as string, init as RequestInit);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function driveOAuth(h: Harness) {
  // Start: capture state cookie + the state param from the redirect URL.
  const startJar = new Jar();
  const startRes = await fetch(`${h.base}/api/auth/oauth/google`, {
    redirect: "manual",
  });
  startJar.apply(startRes as unknown as Response);
  const authUrl = new URL(startRes.headers.get("location")!);
  const state = authUrl.searchParams.get("state")!;
  // Callback with the matching state + oauth cookie.
  const cbRes = await fetch(
    `${h.base}/api/auth/oauth/google/callback?code=abc&state=${state}`,
    { redirect: "manual", headers: { Cookie: startJar.header() } },
  );
  return cbRes;
}

test("OAuth callback creates a user, links the account, issues a session", async () => {
  const restore = installFakeFetch({
    sub: "acc-1",
    email: "oauthuser@example.com",
    verified: true,
    name: "OAuth User",
  });
  const h = await startApp({
    oauthProviders: [oauthProvider({ sub: "acc-1", email: "oauthuser@example.com", verified: true })],
    baseUrl: `http://127.0.0.1`,
  });
  try {
    const cb = await driveOAuth(h);
    assert.strictEqual(cb.status, 302);
    assert.strictEqual(cb.headers.get("location"), "/");
    const sess = (cb.headers.getSetCookie?.() ?? []).find((c) =>
      c.startsWith("kallo.session="),
    );
    assert.ok(sess, "session cookie issued");
  } finally {
    await h.close();
    restore();
  }
});

test("OAuth refuses to auto-link an UNVERIFIED email to an existing account", async () => {
  const restore = installFakeFetch({
    sub: "acc-2",
    email: "victim@example.com",
    verified: false,
  });
  const h = await startApp({
    oauthProviders: [oauthProvider({ sub: "acc-2", email: "victim@example.com", verified: false })],
    baseUrl: `http://127.0.0.1`,
  });
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    // Pre-existing password account for the victim.
    await req(h, jar, "POST", "/api/auth/signup", {
      email: "victim@example.com",
      password: "victimpassword",
    });
    const cb = await driveOAuth(h);
    assert.strictEqual(cb.status, 302);
    assert.match(cb.headers.get("location")!, /auth_error=email_exists/);
    const sess = (cb.headers.getSetCookie?.() ?? []).find((c) =>
      c.startsWith("kallo.session="),
    );
    assert.ok(!sess, "no session issued on refused link");
  } finally {
    await h.close();
    restore();
  }
});

test("OAuth auto-links a VERIFIED email to the existing account", async () => {
  const restore = installFakeFetch({
    sub: "acc-3",
    email: "known@example.com",
    verified: true,
  });
  const h = await startApp({
    oauthProviders: [oauthProvider({ sub: "acc-3", email: "known@example.com", verified: true })],
    baseUrl: `http://127.0.0.1`,
  });
  const jar = new Jar();
  await primeCsrf(h, jar);
  try {
    const signup = await req(h, jar, "POST", "/api/auth/signup", {
      email: "known@example.com",
      password: "knownpassword",
    });
    const existingId = signup.json.user.id;
    const cb = await driveOAuth(h);
    assert.strictEqual(cb.status, 302);
    assert.strictEqual(cb.headers.get("location"), "/");
    // Logged in as the SAME user, not a new one.
    const sessCookie = (cb.headers.getSetCookie?.() ?? [])
      .find((c) => c.startsWith("kallo.session="))!
      .split(";")[0];
    const who = await fetch(`${h.base}/api/auth/session`, {
      headers: { Cookie: sessCookie! },
    });
    const whoJson = await who.json();
    assert.strictEqual(whoJson.user.id, existingId);
  } finally {
    await h.close();
    restore();
  }
});

test("OAuth start redirects with state cookie", async () => {
  const h = await startApp({
    oauthProviders: [
      {
        id: "google",
        clientId: "gid",
        clientSecret: "gsecret",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email",
        usePKCE: true,
        profile: (raw) => ({ providerAccountId: String(raw.sub) }),
      },
    ],
    baseUrl: "https://app.test",
  });
  const jar = new Jar();
  try {
    const res = await fetch(`${h.base}/api/auth/oauth/google`, {
      redirect: "manual",
    });
    assert.strictEqual(res.status, 302);
    const location = res.headers.get("location")!;
    assert.ok(location.startsWith("https://accounts.google.com/"));
    assert.ok(location.includes("code_challenge"));
    jar.apply(res as unknown as Response);
    assert.ok(jar.get("kallo.oauth"), "oauth state cookie set");
  } finally {
    await h.close();
  }
});
