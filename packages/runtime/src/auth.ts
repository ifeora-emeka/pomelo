import { $store } from "./reactivity/index.js";

export interface AuthUser {
  id: string;
  roles?: string[];
  [key: string]: unknown;
}

export interface AuthState {
  user: AuthUser | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
  signIn(
    providerId: string,
    credentials: Record<string, string>,
  ): Promise<AuthUser | null>;
  signUp(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  signOutAll(): Promise<void>;
  fetchSession(): Promise<AuthUser | null>;
  requestPasswordReset(email: string): Promise<boolean>;
  resetPassword(input: {
    email: string;
    token: string;
    password: string;
  }): Promise<boolean>;
  verifyEmail(input: { email: string; token: string }): Promise<boolean>;
  signInWithProvider(providerId: string, returnTo?: string): void;
}

const CSRF_COOKIE = "kallo.csrf";
const CSRF_HEADER = "x-kallo-csrf";

/**
 * Reads the double-submit CSRF token the server sets as a readable cookie, so
 * state-changing auth requests can echo it back in the X-Kallo-CSRF header.
 * Without this every POST to /api/auth would be rejected once CSRF is enabled.
 */
function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  if (!match) return null;
  const raw = match.slice(CSRF_COOKIE.length + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    // A malformed cookie value must not throw and brick every auth POST.
    return raw;
  }
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const csrf = readCsrfToken();
  if (csrf) headers[CSRF_HEADER] = csrf;
  return fetch(url, {
    method: "POST",
    headers,
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
}

function isStaticExport(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __KALLO_STATIC__?: boolean }).__KALLO_STATIC__ ===
      true
  );
}

export const authStore = $store<AuthState>({
  user: null,
  isLoggedIn: false,
  loading: false,
  error: null,

  async fetchSession() {
    // Static exports have no auth server; skip the probe to avoid a 404.
    if (isStaticExport()) return null;
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "same-origin",
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        this.user = data.user ?? null;
        this.isLoggedIn = !!data.user;
        return data.user ?? null;
      }
      return null;
    } catch (err) {
      this.error = (err as Error).message || "Failed to fetch session";
      return null;
    } finally {
      this.loading = false;
    }
  },

  async signIn(providerId: string, credentials: Record<string, string>) {
    this.loading = true;
    this.error = null;
    try {
      const res = await postJson("/api/auth/signin", {
        provider: providerId,
        credentials,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        this.user = data.user;
        this.isLoggedIn = true;
        return data.user;
      }
      this.error = data.error || "Sign in failed";
      return null;
    } catch (err) {
      this.error = (err as Error).message || "Sign in failed";
      return null;
    } finally {
      this.loading = false;
    }
  },

  async signUp(input: { email: string; password: string; name?: string }) {
    this.loading = true;
    this.error = null;
    try {
      const res = await postJson("/api/auth/signup", input);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.user && !data.requiresVerification) {
          this.user = data.user;
          this.isLoggedIn = true;
        }
        return data.user ?? null;
      }
      this.error = data.error || "Sign up failed";
      return null;
    } catch (err) {
      this.error = (err as Error).message || "Sign up failed";
      return null;
    } finally {
      this.loading = false;
    }
  },

  async signOut() {
    this.loading = true;
    this.error = null;
    try {
      const res = await postJson("/api/auth/signout", {});
      if (!res.ok) this.error = "Sign out failed";
    } catch (err) {
      this.error = (err as Error).message || "Sign out failed";
    } finally {
      // Clear local state regardless — the user asked to leave.
      this.user = null;
      this.isLoggedIn = false;
      this.loading = false;
    }
  },

  async signOutAll() {
    this.loading = true;
    this.error = null;
    try {
      await postJson("/api/auth/signout-all", {});
      this.user = null;
      this.isLoggedIn = false;
    } catch (err) {
      this.error = (err as Error).message || "Sign out failed";
    } finally {
      this.loading = false;
    }
  },

  async requestPasswordReset(email: string) {
    this.error = null;
    try {
      const res = await postJson("/api/auth/request-password-reset", { email });
      return res.ok;
    } catch (err) {
      this.error = (err as Error).message || "Request failed";
      return false;
    }
  },

  async resetPassword(input: {
    email: string;
    token: string;
    password: string;
  }) {
    this.error = null;
    try {
      const res = await postJson("/api/auth/reset-password", input);
      const data = await res.json().catch(() => ({}));
      if (res.ok) return true;
      this.error = data.error || "Reset failed";
      return false;
    } catch (err) {
      this.error = (err as Error).message || "Reset failed";
      return false;
    }
  },

  async verifyEmail(input: { email: string; token: string }) {
    this.error = null;
    try {
      const res = await postJson("/api/auth/verify-email", input);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await this.fetchSession();
        return true;
      }
      this.error = data.error || "Verification failed";
      return false;
    } catch (err) {
      this.error = (err as Error).message || "Verification failed";
      return false;
    }
  },

  signInWithProvider(providerId: string, returnTo?: string) {
    if (typeof window === "undefined") return;
    const suffix = returnTo
      ? `?returnTo=${encodeURIComponent(returnTo)}`
      : "";
    window.location.href = `/api/auth/oauth/${providerId}${suffix}`;
  },
});

if (typeof window !== "undefined") {
  authStore.fetchSession().catch(() => {});
}

export function useAuth() {
  return authStore;
}
