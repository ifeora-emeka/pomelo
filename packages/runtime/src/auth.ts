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
  signOut(): Promise<void>;
  fetchSession(): Promise<AuthUser | null>;
}

export const authStore = $store<AuthState>({
  user: null,
  isLoggedIn: false,
  loading: false,
  error: null,

  async fetchSession() {
    // Static exports have no auth server; skip the probe to avoid a 404.
    if (
      typeof window !== "undefined" &&
      (window as unknown as { __KALLO_STATIC__?: boolean }).__KALLO_STATIC__ ===
        true
    ) {
      return null;
    }
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        this.user = data.user;
        this.isLoggedIn = !!data.user;
        return data.user;
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
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, credentials }),
      });
      if (res.ok) {
        const data = await res.json();
        this.user = data.user;
        this.isLoggedIn = true;
        return data.user;
      } else {
        const data = await res.json();
        this.error = data.error || "Sign in failed";
        return null;
      }
    } catch (err) {
      this.error = (err as Error).message || "Sign in failed";
      return null;
    } finally {
      this.loading = false;
    }
  },

  async signOut() {
    this.loading = true;
    this.error = null;
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      this.user = null;
      this.isLoggedIn = false;
    } catch (err) {
      this.error = (err as Error).message || "Sign out failed";
    } finally {
      this.loading = false;
    }
  },
});

if (typeof window !== "undefined") {
  authStore.fetchSession().catch(() => {});
}

export function useAuth() {
  return authStore;
}
