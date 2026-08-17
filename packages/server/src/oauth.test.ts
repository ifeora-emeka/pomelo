import test from "node:test";
import assert from "node:assert";
import {
  buildAuthorizationUrl,
  codeChallengeS256,
  generateCodeVerifier,
  generateState,
  googleOAuth,
  githubOAuth,
} from "./oauth.js";

const google = googleOAuth({ clientId: "gid", clientSecret: "gsecret" });

test("buildAuthorizationUrl includes required params + PKCE challenge", () => {
  const verifier = generateCodeVerifier();
  const url = new URL(
    buildAuthorizationUrl(google, {
      redirectUri: "https://app.test/api/auth/oauth/google/callback",
      state: "abc",
      codeVerifier: verifier,
    }),
  );
  assert.strictEqual(url.searchParams.get("client_id"), "gid");
  assert.strictEqual(url.searchParams.get("response_type"), "code");
  assert.strictEqual(url.searchParams.get("state"), "abc");
  assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");
  assert.strictEqual(
    url.searchParams.get("code_challenge"),
    codeChallengeS256(verifier),
  );
  // preset extra params
  assert.strictEqual(url.searchParams.get("access_type"), "offline");
});

test("github preset omits PKCE", () => {
  const gh = githubOAuth({ clientId: "id", clientSecret: "s" });
  const url = new URL(
    buildAuthorizationUrl(gh, {
      redirectUri: "https://app.test/cb",
      state: "s1",
      codeVerifier: "v",
    }),
  );
  assert.strictEqual(url.searchParams.get("code_challenge"), null);
});

test("state and verifier are unique + url-safe", () => {
  assert.notStrictEqual(generateState(), generateState());
  assert.match(generateCodeVerifier(), /^[A-Za-z0-9_-]+$/);
});

test("google profile mapper normalizes fields", async () => {
  const profile = await google.profile(
    {
      sub: "123",
      email: "a@b.com",
      email_verified: true,
      name: "A B",
      picture: "http://img",
    },
    "tok",
  );
  assert.deepStrictEqual(profile, {
    providerAccountId: "123",
    email: "a@b.com",
    emailVerified: true,
    name: "A B",
    image: "http://img",
  });
});
