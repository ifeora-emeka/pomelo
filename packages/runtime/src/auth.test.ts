import test from "node:test";
import assert from "node:assert";
import { authStore, useAuth } from "./auth.js";

test("Client-side authStore holds initial state", () => {
  const auth = useAuth();
  assert.strictEqual(auth.user, null);
  assert.strictEqual(auth.isLoggedIn, false);
  assert.strictEqual(auth.loading, false);
  assert.strictEqual(auth.error, null);
});

test("Client-side authStore fetchSession success", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = async (url) => {
    fetchCalled = true;
    assert.strictEqual(url, "/api/auth/session");
    return {
      ok: true,
      async json() {
        return { user: { id: "user-1", name: "Alice" } };
      },
    } as any;
  };

  try {
    const user = await authStore.fetchSession();
    assert.ok(fetchCalled);
    assert.strictEqual(user?.id, "user-1");
    assert.strictEqual(user?.name, "Alice");
    assert.strictEqual(authStore.user?.id, "user-1");
    assert.strictEqual(authStore.user?.name, "Alice");
    assert.strictEqual(authStore.isLoggedIn, true);
    assert.strictEqual(authStore.error, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Client-side authStore signIn and signOut success", async () => {
  const originalFetch = globalThis.fetch;
  let signInCalled = false;
  let signOutCalled = false;

  globalThis.fetch = async (url, options) => {
    if (url === "/api/auth/signin") {
      signInCalled = true;
      assert.strictEqual(options?.method, "POST");
      const body = JSON.parse(options.body as string);
      assert.strictEqual(body.provider, "credentials");
      assert.deepStrictEqual(body.credentials, { username: "admin" });
      return {
        ok: true,
        async json() {
          return { user: { id: "admin-id", name: "Admin" } };
        },
      } as any;
    } else if (url === "/api/auth/signout") {
      signOutCalled = true;
      assert.strictEqual(options?.method, "POST");
      return {
        ok: true,
        async json() {
          return { success: true };
        },
      } as any;
    }
    throw new Error("unexpected fetch url " + url);
  };

  try {
    // Test sign in
    const user = await authStore.signIn("credentials", { username: "admin" });
    assert.ok(signInCalled);
    assert.strictEqual(user?.id, "admin-id");
    assert.strictEqual(user?.name, "Admin");
    assert.strictEqual(authStore.user?.id, "admin-id");
    assert.strictEqual(authStore.user?.name, "Admin");
    assert.strictEqual(authStore.isLoggedIn, true);

    // Test sign out
    await authStore.signOut();
    assert.ok(signOutCalled);
    assert.strictEqual(authStore.user, null);
    assert.strictEqual(authStore.isLoggedIn, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
