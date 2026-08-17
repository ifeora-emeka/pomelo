import crypto from "node:crypto";

// === OAuth 2.0 / OIDC ===
//
// A small, dependency-free OAuth2 authorization-code client with PKCE and
// state (CSRF) protection, plus Google and GitHub presets. Providers are plain
// config objects so any OAuth2/OIDC provider can be added without new code.

export interface OAuthProfile {
  providerAccountId: string;
  email?: string | null;
  emailVerified?: boolean;
  name?: string | null;
  image?: string | null;
}

export interface OAuthProvider {
  id: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  scope: string;
  /** Use PKCE (S256). Recommended and on by default. */
  usePKCE?: boolean;
  /** Extra params appended to the authorization request. */
  authorizationParams?: Record<string, string>;
  /** Maps the provider's raw userinfo response to a normalized profile. */
  profile: (raw: Record<string, unknown>, accessToken: string) =>
    | OAuthProfile
    | Promise<OAuthProfile>;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  [key: string]: unknown;
}

// --- PKCE + state helpers ---

export function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export interface AuthorizationUrlInput {
  redirectUri: string;
  state: string;
  codeVerifier?: string;
}

/**
 * buildAuthorizationUrl — constructs the provider authorize URL, including the
 * PKCE code_challenge when a verifier is supplied.
 */
export function buildAuthorizationUrl(
  provider: OAuthProvider,
  input: AuthorizationUrlInput,
): string {
  const url = new URL(provider.authorizationUrl);
  url.searchParams.set("client_id", provider.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", provider.scope);
  url.searchParams.set("state", input.state);
  if (provider.usePKCE !== false && input.codeVerifier) {
    url.searchParams.set(
      "code_challenge",
      codeChallengeS256(input.codeVerifier),
    );
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(provider.authorizationParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * exchangeCodeForToken — trades an authorization code for tokens at the
 * provider's token endpoint. Sends the PKCE code_verifier when present.
 */
export async function exchangeCodeForToken(
  provider: OAuthProvider,
  input: { code: string; redirectUri: string; codeVerifier?: string },
): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
  });
  if (provider.usePKCE !== false && input.codeVerifier) {
    body.set("code_verifier", input.codeVerifier);
  }
  const res = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OAuth token exchange failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as OAuthTokenResponse;
}

/**
 * fetchOAuthProfile — calls the provider's userinfo endpoint (if configured)
 * and normalizes the result via provider.profile.
 */
export async function fetchOAuthProfile(
  provider: OAuthProvider,
  accessToken: string,
): Promise<OAuthProfile> {
  let raw: Record<string, unknown> = {};
  if (provider.userInfoUrl) {
    const res = await fetch(provider.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "kallo-auth",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `OAuth userinfo failed (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    raw = (await res.json()) as Record<string, unknown>;
  }
  return provider.profile(raw, accessToken);
}

// --- Presets ---

export function googleOAuth(config: {
  clientId: string;
  clientSecret: string;
  scope?: string;
}): OAuthProvider {
  return {
    id: "google",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: config.scope ?? "openid email profile",
    usePKCE: true,
    authorizationParams: { access_type: "offline", prompt: "consent" },
    profile(raw) {
      return {
        providerAccountId: String(raw.sub ?? ""),
        email: (raw.email as string) ?? null,
        emailVerified: raw.email_verified === true,
        name: (raw.name as string) ?? null,
        image: (raw.picture as string) ?? null,
      };
    },
  };
}

export function githubOAuth(config: {
  clientId: string;
  clientSecret: string;
  scope?: string;
}): OAuthProvider {
  return {
    id: "github",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scope: config.scope ?? "read:user user:email",
    // GitHub does not support PKCE for OAuth Apps; rely on state + secret.
    usePKCE: false,
    async profile(raw, accessToken) {
      let email = (raw.email as string) ?? null;
      let emailVerified = false;
      // GitHub omits private emails from /user; fetch the verified primary.
      if (!email) {
        try {
          const res = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
              "User-Agent": "kallo-auth",
            },
          });
          if (res.ok) {
            const emails = (await res.json()) as Array<{
              email: string;
              primary: boolean;
              verified: boolean;
            }>;
            const primary =
              emails.find((e) => e.primary && e.verified) ??
              emails.find((e) => e.verified);
            if (primary) {
              email = primary.email;
              emailVerified = primary.verified;
            }
          }
        } catch {
          // Non-fatal: fall through with no email.
        }
      } else {
        emailVerified = true;
      }
      return {
        providerAccountId: String(raw.id ?? ""),
        email,
        emailVerified,
        name: (raw.name as string) ?? (raw.login as string) ?? null,
        image: (raw.avatar_url as string) ?? null,
      };
    },
  };
}
