import { $store } from "./reactivity/index.js";

export interface AuthState {
  user: { id: string; roles?: string[]; [key: string]: any } | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
  signIn(providerId: string, credentials: Record<string, string>): Promise<any | null>;
  signOut(): Promise<void>;
  fetchSession(): Promise<any | null>;
}

export const authStore = $store<AuthState>({
  user: null,
  isLoggedIn: false,
  loading: false,
  error: null,

  async fetchSession() {
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
    } catch (err: any) {
      this.error = err.message || "Failed to fetch session";
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
    } catch (err: any) {
      this.error = err.message || "Sign in failed";
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
    } catch (err: any) {
      this.error = err.message || "Sign out failed";
    } finally {
      this.loading = false;
    }
  }
});

if (typeof window !== "undefined") {
  authStore.fetchSession().catch(() => {});
}

export function useAuth() {
  return authStore;
}
