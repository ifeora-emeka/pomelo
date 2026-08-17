import crypto from "node:crypto";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  signToken,
  verifyToken,
  $resolveAuthSecret,
  COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from "./auth.js";
import {
  $hashPassword,
  $verifyPassword,
  $passwordNeedsRehash,
} from "./password.js";
import {
  type AuthAdapter,
  type AuthUserRecord,
  MemoryAuthAdapter,
  $sanitizeUser,
  __normalizeEmail as normalizeEmail,
} from "./auth-adapter.js";
import {
  type OAuthProvider,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchOAuthProfile,
  generateState,
  generateCodeVerifier,
} from "./oauth.js";
import { $csrf } from "./security.js";
import {
  $rateLimit,
  MemoryRateLimitStore,
  type RateLimitStore,
} from "./rate-limit.js";

// === Auth engine: adapter-backed, revocable sessions + full route surface ===

export interface CredentialProvider {
  id: string;
  authorize(
    credentials: Record<string, string>,
  ): Promise<Record<string, unknown> | null>;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  url: string;
  purpose: "email-verify" | "password-reset";
}

export interface AuthEngineOptions {
  secret?: string;
  adapter?: AuthAdapter;
  /** Mount path for the auth routes. Default "/api/auth". */
  basePath?: string;
  cookieName?: string;
  cookieDomain?: string;
  sessionMaxAgeMs?: number;
  /** Re-issue the session cookie once it is past half its lifetime. */
  slidingSession?: boolean;
  /** Block sign-in until the email is verified. Default false. */
  requireEmailVerification?: boolean;
  /** Minimum password length for signup. Default 8. */
  minPasswordLength?: number;
  /** Absolute site origin, e.g. "https://app.example.com". Used to build
   *  OAuth redirect URIs and email links. Falls back to the request host. */
  baseUrl?: string;
  /** Trust X-Forwarded-* when deriving origin from the request. Default false. */
  trustProxy?: boolean;
  /** Legacy + credential sign-in providers. */
  providers?: CredentialProvider[];
  oauthProviders?: OAuthProvider[];
  /** Delivers verification / reset emails. Defaults to a console transport. */
  sendEmail?: (input: SendEmailInput) => void | Promise<void>;
  /** Disable the built-in CSRF guard on auth routes (not recommended). */
  csrf?: boolean;
  /** Shared rate-limit store (e.g. Redis-backed). Defaults to in-memory. */
  rateLimitStore?: RateLimitStore;
  /** Enable auth routes even without an adapter (stateless legacy mode). */
  allowStateless?: boolean;
  /** Local path an OAuth failure redirects to (with ?auth_error=). Default "/". */
  errorRedirect?: string;
  /** Maximum accepted password length (guards scrypt CPU DoS). Default 1024. */
  maxPasswordLength?: number;
}

interface SessionRequest extends Request {
  user?: Record<string, unknown> | null;
  session?: unknown;
}

const OAUTH_STATE_COOKIE = "kallo.oauth";
const OAUTH_TTL_MS = 10 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Only allow same-origin relative redirect targets. Rejects protocol-relative
 * (`//host`), backslash tricks (`/\host`, which some browsers treat as `//`)
 * and any control/whitespace characters (tabs/newlines that proxies may strip
 * to reconstruct `///host`). Prevents open-redirect after auth.
 */
function isSafeLocalPath(p: unknown): p is string {
  if (typeof p !== "string" || p.length === 0) return false;
  if (p[0] !== "/") return false;
  if (p[1] === "/" || p[1] === "\\") return false;
  // Reject backslashes and ASCII control chars (incl. tab/newline) anywhere.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f\\]/.test(p)) return false;
  return true;
}

function defaultSendEmail(input: SendEmailInput): void {
  console.log(
    `[kallo:auth] ${input.purpose} email for ${input.to} → ${input.url}`,
  );
}

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface KalloAuth {
  router: Router;
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  adapter: AuthAdapter;
  /** Revoke every session for a user (log out all devices). */
  revokeUserSessions(userId: string): Promise<void>;
}

/**
 * createKalloAuth — builds the full auth subsystem: a session middleware that
 * resolves the current user from a revocable server-side session, and an
 * Express router exposing sign-up/in/out, password reset, email verification
 * and OAuth. CSRF and rate limiting are wired in by default.
 */
export function createKalloAuth(options: AuthEngineOptions = {}): KalloAuth {
  const secret = $resolveAuthSecret(options.secret);
  const adapter: AuthAdapter = options.adapter ?? new MemoryAuthAdapter();
  const cookieName = options.cookieName ?? COOKIE_NAME;
  const maxAge = options.sessionMaxAgeMs ?? SESSION_MAX_AGE_MS;
  const minPasswordLength = options.minPasswordLength ?? 8;
  const maxPasswordLength = options.maxPasswordLength ?? 1024;
  const sendEmail = options.sendEmail ?? defaultSendEmail;
  const csrfEnabled = options.csrf !== false;
  const oauthProviders = options.oauthProviders ?? [];
  const credentialProviders = options.providers ?? [];
  const errorRedirect = options.errorRedirect ?? "/";

  // Warn loudly if a flow that emails users is enabled in production without a
  // real transport — otherwise reset/verify links only get console.log'd and
  // users are silently stranded.
  if (
    isProd() &&
    !options.sendEmail &&
    (options.requireEmailVerification || options.adapter)
  ) {
    console.warn(
      "[kallo:auth] No sendEmail transport configured; password-reset and verification emails will only be logged, not delivered.",
    );
  }

  function cookieOpts(extra: Record<string, unknown> = {}) {
    return {
      httpOnly: true,
      secure: isProd(),
      sameSite: "lax" as const,
      path: "/",
      domain: options.cookieDomain,
      ...extra,
    };
  }

  /**
   * issueSession — sets the session cookie. `stateful` is passed explicitly by
   * the caller rather than inferred from the adapter: adapter-owned users
   * (email/password, OAuth) get a revocable server-side session ({sid}), while
   * custom credential providers that own their own user store get a stateless
   * embedded session ({u}). Inferring the mode by probing the adapter by id was
   * unsafe — a custom provider returning an id that happened to collide with a
   * real adapter user's id would have been logged in AS that user.
   */
  async function issueSession(
    res: Response,
    user: AuthUserRecord | { id: string; [k: string]: unknown },
    stateful: boolean,
  ): Promise<Record<string, unknown>> {
    const sanitized = $sanitizeUser(user as AuthUserRecord);
    const expiresAt = Date.now() + maxAge;
    let token: string;
    if (stateful) {
      const session = await adapter.createSession({
        userId: String(user.id),
        expiresAt,
      });
      token = signToken({ sid: session.id }, secret, maxAge);
    } else {
      // Stateless sessions cannot be revoked server-side (there is no record);
      // signout clears the cookie but a leaked token stays valid until expiry.
      token = signToken({ u: sanitized }, secret, maxAge);
    }
    res.cookie(cookieName, token, cookieOpts({ maxAge }));
    return sanitized;
  }

  async function resolveSession(
    req: Request,
    res?: Response,
  ): Promise<Record<string, unknown> | null> {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const token = cookies?.[cookieName];
    if (!token) return null;
    const payload = verifyToken(token, secret) as
      | { sid?: string; u?: Record<string, unknown> }
      | null;
    if (!payload) return null;

    // Stateless embedded session (custom provider path).
    if (!payload.sid) {
      return payload.u && typeof payload.u === "object" ? payload.u : null;
    }

    const session = await adapter.getSession(payload.sid);
    if (!session) return null;
    const user = await adapter.getUserById(session.userId);
    if (!user) {
      // Session points at a deleted user — clean it up.
      await adapter.deleteSession(session.id);
      return null;
    }
    // Sliding expiration: renew once past the halfway mark.
    if (options.slidingSession && res) {
      const remaining = session.expiresAt - Date.now();
      if (remaining < maxAge / 2) {
        const fresh = await adapter.createSession({
          userId: session.userId,
          expiresAt: Date.now() + maxAge,
        });
        await adapter.deleteSession(session.id);
        const next = signToken({ sid: fresh.id }, secret, maxAge);
        res.cookie(cookieName, next, cookieOpts({ maxAge }));
      }
    }
    return $sanitizeUser(user);
  }

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    resolveSession(req, res)
      .then((user) => {
        (req as SessionRequest).user = user;
        (req as SessionRequest).session = user ? { user } : undefined;
        next();
      })
      .catch(next);
  };

  function originOf(req: Request): string {
    if (options.baseUrl) return options.baseUrl.replace(/\/$/, "");
    const proto = options.trustProxy
      ? ((req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() ??
        req.protocol)
      : req.protocol;
    const host = options.trustProxy
      ? ((req.headers["x-forwarded-host"] as string)?.split(",")[0]?.trim() ??
        req.headers.host)
      : req.headers.host;
    return `${proto}://${host}`;
  }

  const base = (options.basePath ?? "/api/auth").replace(/\/$/, "");
  function callbackUri(req: Request, providerId: string): string {
    return `${originOf(req)}${base}/oauth/${providerId}/callback`;
  }

  const router = Router();

  // --- CSRF + rate limiting (on by default) ---
  if (csrfEnabled) {
    router.use(
      $csrf({
        // OAuth start/callback are top-level GET navigations; state cookie
        // protects them instead of the double-submit token.
        ignorePaths: [new RegExp(`^${base}/oauth/`)],
      }),
    );
  }
  // One shared store, but each sensitive route gets its OWN namespaced bucket
  // so unrelated flows (e.g. OAuth starts vs. sign-in attempts) can't drain
  // each other's budget. Keying is per client IP (see rate-limit.ts on why
  // X-Forwarded-For is not trusted unless `trust proxy` is configured).
  const rlStore: RateLimitStore =
    options.rateLimitStore ?? new MemoryRateLimitStore();
  function clientIp(req: Request): string {
    return req.ip ?? req.socket?.remoteAddress ?? "unknown";
  }
  function limiter(tag: string, max: number) {
    return $rateLimit({
      windowMs: 15 * 60 * 1000,
      max,
      store: rlStore,
      keyGenerator: (req) => `${tag}:${clientIp(req)}`,
      message: "Too many attempts, please try again later.",
    });
  }

  function fail(res: Response, status: number, error: string): void {
    res.status(status).json({ error });
  }

  // Lazily computed once, at current scrypt cost, for anti-enumeration timing.
  let dummyHash: string | null = null;
  async function getDummyHash(): Promise<string> {
    if (!dummyHash) {
      dummyHash = await $hashPassword(
        crypto.randomBytes(16).toString("hex"),
      );
    }
    return dummyHash;
  }

  /** Returns an error string if the password is unacceptable, else null. */
  function badPassword(password: unknown): string | null {
    if (typeof password !== "string" || password.length < minPasswordLength) {
      return `Password must be at least ${minPasswordLength} characters`;
    }
    if (password.length > maxPasswordLength) {
      return `Password must be at most ${maxPasswordLength} characters`;
    }
    return null;
  }

  // GET /session — reuse the user the session middleware already resolved so
  // the session isn't resolved (and slid) twice in one request.
  router.get(`${base}/session`, (req: Request, res: Response) => {
    res.json({ user: (req as SessionRequest).user ?? null });
  });

  // POST /signup — credential registration
  router.post(
    `${base}/signup`,
    limiter("signup", 10),
    async (req: Request, res: Response) => {
      if (!options.adapter && !options.allowStateless) {
        return fail(res, 501, "Sign-up requires an auth adapter");
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = body.email;
      if (!isValidEmail(email)) return fail(res, 400, "Valid email required");
      const pwError = badPassword(body.password);
      if (pwError) return fail(res, 400, pwError);
      const password = body.password as string;
      const normalized = normalizeEmail(email);
      const existing = await adapter.getUserByEmail(normalized);
      if (existing) return fail(res, 409, "Email already registered");

      const passwordHash = await $hashPassword(password);
      const user = await adapter.createUser({
        email: normalized,
        name: typeof body.name === "string" ? body.name : null,
        passwordHash,
      });

      if (options.requireEmailVerification) {
        await sendVerificationEmail(req, user.email);
        return res.status(201).json({
          user: $sanitizeUser(user),
          requiresVerification: true,
        });
      }
      const safe = await issueSession(res, user, true);
      res.status(201).json({ user: safe });
    },
  );

  // POST /signin — credential + legacy providers
  router.post(
    `${base}/signin`,
    limiter("signin", 10),
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const providerId = (body.provider as string) ?? "credentials";
      const credentials = (body.credentials ?? {}) as Record<string, string>;

      // Legacy / custom provider path. These users are not in the adapter, so
      // the session is stateless (not server-revocable) by design.
      const custom = credentialProviders.find((p) => p.id === providerId);
      if (custom) {
        try {
          const result = await custom.authorize(credentials);
          if (!result || !result.id) return fail(res, 401, "Invalid credentials");
          const safe = await issueSession(
            res,
            result as { id: string; [k: string]: unknown },
            false,
          );
          rlStore.resetKey?.(`signin:${clientIp(req)}`);
          return res.json({ user: safe });
        } catch {
          return fail(res, 401, "Invalid credentials");
        }
      }

      // Built-in email/password path (requires adapter).
      if (!options.adapter && !options.allowStateless) {
        return fail(res, 400, `Provider ${providerId} not found`);
      }
      const email = credentials.email ?? (body.email as string);
      const password = credentials.password ?? (body.password as string);
      if (!isValidEmail(email) || typeof password !== "string") {
        return fail(res, 401, "Invalid credentials");
      }
      const user = await adapter.getUserByEmail(normalizeEmail(email));
      // Always run a hash comparison even for unknown users to blunt
      // user-enumeration timing. The dummy hash is computed from the current
      // scrypt defaults so its cost tracks real hashes if defaults change.
      const hash = user?.passwordHash ?? (await getDummyHash());
      const ok = await $verifyPassword(password, hash);
      if (!user || !user.passwordHash || !ok) {
        return fail(res, 401, "Invalid credentials");
      }
      if (options.requireEmailVerification && !user.emailVerified) {
        return fail(res, 403, "Email not verified");
      }
      // Transparent hash upgrade.
      if ($passwordNeedsRehash(user.passwordHash)) {
        const rehashed = await $hashPassword(password);
        await adapter.updateUser(user.id, { passwordHash: rehashed });
      }
      const safe = await issueSession(res, user, true);
      rlStore.resetKey?.(`signin:${clientIp(req)}`);
      res.json({ user: safe });
    },
  );

  // POST /signout
  router.post(`${base}/signout`, async (req: Request, res: Response) => {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const token = cookies?.[cookieName];
    if (token) {
      const payload = verifyToken(token, secret) as { sid?: string } | null;
      if (payload?.sid) await adapter.deleteSession(payload.sid);
    }
    res.clearCookie(cookieName, cookieOpts());
    res.json({ success: true });
  });

  // POST /signout-all — revoke every session for the current user
  router.post(`${base}/signout-all`, async (req: Request, res: Response) => {
    const user = await resolveSession(req).catch(() => null);
    if (!user) return fail(res, 401, "Unauthorized");
    await adapter.deleteUserSessions(String(user.id));
    res.clearCookie(cookieName, cookieOpts());
    res.json({ success: true });
  });

  // POST /request-password-reset — always 200 (no user enumeration)
  router.post(
    `${base}/request-password-reset`,
    limiter("pwreset-req", 5),
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = body.email;
      if (isValidEmail(email)) {
        const user = await adapter.getUserByEmail(normalizeEmail(email));
        if (user) {
          const raw = crypto.randomBytes(32).toString("base64url");
          await adapter.deleteVerificationTokens(user.email, "password-reset");
          await adapter.createVerificationToken({
            identifier: user.email,
            tokenHash: hashToken(raw),
            purpose: "password-reset",
            expiresAt: Date.now() + RESET_TTL_MS,
          });
          const url = `${originOf(req)}${base}/reset-password?token=${raw}&email=${encodeURIComponent(user.email)}`;
          await sendEmail({
            to: user.email,
            subject: "Reset your password",
            text: `Reset your password: ${url}`,
            url,
            purpose: "password-reset",
          });
        }
      }
      res.json({ success: true });
    },
  );

  // POST /reset-password
  router.post(
    `${base}/reset-password`,
    limiter("pwreset", 10),
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = body.email;
      const token = body.token;
      const password = body.password;
      if (!isValidEmail(email) || typeof token !== "string") {
        return fail(res, 400, "Invalid reset request");
      }
      const pwError = badPassword(password);
      if (pwError) return fail(res, 400, pwError);
      const record = await adapter.useVerificationToken({
        identifier: normalizeEmail(email),
        tokenHash: hashToken(token),
        purpose: "password-reset",
      });
      if (!record) return fail(res, 400, "Invalid or expired token");
      const user = await adapter.getUserByEmail(normalizeEmail(email));
      if (!user) return fail(res, 400, "Invalid or expired token");
      const passwordHash = await $hashPassword(password as string);
      await adapter.updateUser(user.id, {
        passwordHash,
        emailVerified: user.emailVerified ?? Date.now(),
      });
      // Password changed — revoke all existing sessions.
      await adapter.deleteUserSessions(user.id);
      res.json({ success: true });
    },
  );

  async function sendVerificationEmail(
    req: Request,
    email: string,
  ): Promise<void> {
    const raw = crypto.randomBytes(32).toString("base64url");
    await adapter.deleteVerificationTokens(email, "email-verify");
    await adapter.createVerificationToken({
      identifier: normalizeEmail(email),
      tokenHash: hashToken(raw),
      purpose: "email-verify",
      expiresAt: Date.now() + VERIFY_TTL_MS,
    });
    const url = `${originOf(req)}${base}/verify-email?token=${raw}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email,
      subject: "Verify your email",
      text: `Verify your email: ${url}`,
      url,
      purpose: "email-verify",
    });
  }

  // POST /request-email-verification
  router.post(
    `${base}/request-email-verification`,
    limiter("verify-req", 5),
    async (req: Request, res: Response) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const email = body.email;
      if (isValidEmail(email)) {
        const user = await adapter.getUserByEmail(normalizeEmail(email));
        if (user && !user.emailVerified) {
          await sendVerificationEmail(req, user.email);
        }
      }
      res.json({ success: true });
    },
  );

  // GET or POST /verify-email
  const verifyEmail = async (req: Request, res: Response) => {
    const src = (
      req.method === "GET" ? req.query : req.body ?? {}
    ) as Record<string, unknown>;
    const email = src.email;
    const token = src.token;
    if (!isValidEmail(email) || typeof token !== "string") {
      return fail(res, 400, "Invalid verification request");
    }
    const record = await adapter.useVerificationToken({
      identifier: normalizeEmail(email),
      tokenHash: hashToken(token),
      purpose: "email-verify",
    });
    if (!record) return fail(res, 400, "Invalid or expired token");
    const user = await adapter.getUserByEmail(normalizeEmail(email));
    if (!user) return fail(res, 400, "Invalid or expired token");
    await adapter.updateUser(user.id, { emailVerified: Date.now() });
    res.json({ success: true });
  };
  router.get(`${base}/verify-email`, verifyEmail);
  router.post(`${base}/verify-email`, verifyEmail);

  // --- OAuth ---
  // Redirect the user to a friendly error page instead of dumping JSON at a
  // top-level navigation when an OAuth handshake fails.
  function oauthError(res: Response, code: string): void {
    const sep = errorRedirect.includes("?") ? "&" : "?";
    res.redirect(`${errorRedirect}${sep}auth_error=${encodeURIComponent(code)}`);
  }

  // GET /oauth/:provider — begin the authorization-code flow
  router.get(
    `${base}/oauth/:provider`,
    limiter("oauth", 20),
    (req: Request, res: Response) => {
      const provider = oauthProviders.find(
        (p) => p.id === req.params.provider,
      );
      if (!provider) return fail(res, 404, "Unknown OAuth provider");
      const state = generateState();
      const codeVerifier =
        provider.usePKCE !== false ? generateCodeVerifier() : undefined;
      const returnTo = isSafeLocalPath(req.query.returnTo)
        ? (req.query.returnTo as string)
        : "/";
      const stateToken = signToken(
        { state, codeVerifier, returnTo, provider: provider.id },
        secret,
        OAUTH_TTL_MS,
      );
      res.cookie(
        OAUTH_STATE_COOKIE,
        stateToken,
        cookieOpts({ maxAge: OAUTH_TTL_MS }),
      );
      const url = buildAuthorizationUrl(provider, {
        redirectUri: callbackUri(req, provider.id),
        state,
        codeVerifier,
      });
      res.redirect(url);
    },
  );

  // GET /oauth/:provider/callback
  router.get(
    `${base}/oauth/:provider/callback`,
    async (req: Request, res: Response) => {
      const provider = oauthProviders.find(
        (p) => p.id === req.params.provider,
      );
      if (!provider) return fail(res, 404, "Unknown OAuth provider");
      if (!options.adapter && !options.allowStateless) {
        return fail(res, 501, "OAuth requires an auth adapter");
      }
      const cookies = (req as Request & { cookies?: Record<string, string> })
        .cookies;
      const stateToken = cookies?.[OAUTH_STATE_COOKIE];
      res.clearCookie(OAUTH_STATE_COOKIE, cookieOpts());
      const stored = stateToken
        ? (verifyToken(stateToken, secret) as {
            state?: string;
            codeVerifier?: string;
            returnTo?: string;
            provider?: string;
          } | null)
        : null;
      if (
        !stored ||
        stored.provider !== provider.id ||
        typeof stored.state !== "string" ||
        typeof req.query.state !== "string" ||
        req.query.state !== stored.state
      ) {
        return oauthError(res, "invalid_state");
      }
      if (typeof req.query.code !== "string") {
        return oauthError(res, "missing_code");
      }
      try {
        const tokenRes = await exchangeCodeForToken(provider, {
          code: req.query.code,
          redirectUri: callbackUri(req, provider.id),
          codeVerifier: stored.codeVerifier,
        });
        const profile = await fetchOAuthProfile(
          provider,
          tokenRes.access_token,
        );
        if (!profile.providerAccountId) {
          return oauthError(res, "no_account_id");
        }
        // Find or create the user, link the account.
        let user: AuthUserRecord | null = null;
        const account = await adapter.getAccount(
          provider.id,
          profile.providerAccountId,
        );
        if (account) {
          user = await adapter.getUserById(account.userId);
        }
        // Auto-link to an existing account by email ONLY when the provider
        // asserts the email is verified. Linking an unverified provider email
        // to a pre-existing (e.g. password) account is a classic takeover
        // vector, so refuse it and make the user link explicitly instead.
        if (!user && profile.email) {
          const byEmail = await adapter.getUserByEmail(profile.email);
          if (byEmail) {
            if (profile.emailVerified) {
              user = byEmail;
            } else {
              return oauthError(res, "email_exists");
            }
          }
        }
        if (!user) {
          try {
            user = await adapter.createUser({
              email:
                profile.email ??
                `${provider.id}_${profile.providerAccountId}@users.noreply`,
              name: profile.name ?? null,
              image: profile.image ?? null,
              emailVerified: profile.emailVerified ? Date.now() : null,
            });
          } catch {
            // Lost a race (or email taken) — surface rather than 500.
            return oauthError(res, "account_exists");
          }
        }
        if (!account) {
          await adapter.linkAccount({
            userId: user.id,
            provider: provider.id,
            providerAccountId: profile.providerAccountId,
            accessToken: tokenRes.access_token ?? null,
            refreshToken: tokenRes.refresh_token ?? null,
            expiresAt: tokenRes.expires_in
              ? Date.now() + tokenRes.expires_in * 1000
              : null,
          });
        }
        await issueSession(res, user, true);
        const returnTo = isSafeLocalPath(stored.returnTo)
          ? stored.returnTo
          : "/";
        res.redirect(returnTo);
      } catch (err) {
        console.error("[kallo:auth] OAuth callback error:", err);
        return oauthError(res, "oauth_failed");
      }
    },
  );

  return {
    router,
    middleware,
    adapter,
    revokeUserSessions: (userId: string) =>
      adapter.deleteUserSessions(userId),
  };
}

export const __authEngineInternals = { isSafeLocalPath };
