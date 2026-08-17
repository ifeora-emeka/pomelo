import crypto from "node:crypto";

// === Auth persistence contract ===
//
// Everything stateful in Kallo auth (users, sessions, OAuth accounts, one-time
// verification tokens) goes through an AuthAdapter. The framework ships a
// MemoryAuthAdapter for local dev and tests; production apps implement this
// interface against their database (Prisma, Drizzle, raw SQL, ...).
//
// The adapter is the single reason server-side session revocation, "log out
// all devices", email verification and password reset are possible — none of
// that works with a purely stateless cookie.

export interface AuthUserRecord {
  id: string;
  email: string;
  /** null until the address is verified. */
  emailVerified: number | null;
  name?: string | null;
  image?: string | null;
  /** scrypt hash from $hashPassword; absent for OAuth-only users. */
  passwordHash?: string | null;
  roles?: string[];
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
}

export interface AccountRecord {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: number | null;
}

export type VerificationPurpose = "email-verify" | "password-reset";

export interface VerificationTokenRecord {
  identifier: string;
  /** SHA-256 of the raw token — the raw value is only ever emailed. */
  tokenHash: string;
  purpose: VerificationPurpose;
  expiresAt: number;
}

export interface CreateUserInput {
  email: string;
  name?: string | null;
  image?: string | null;
  passwordHash?: string | null;
  emailVerified?: number | null;
  roles?: string[];
  [key: string]: unknown;
}

export interface AuthAdapter {
  createUser(input: CreateUserInput): Promise<AuthUserRecord>;
  getUserById(id: string): Promise<AuthUserRecord | null>;
  getUserByEmail(email: string): Promise<AuthUserRecord | null>;
  updateUser(
    id: string,
    patch: Partial<AuthUserRecord>,
  ): Promise<AuthUserRecord | null>;

  createSession(input: {
    userId: string;
    expiresAt: number;
  }): Promise<SessionRecord>;
  getSession(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  getAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<AccountRecord | null>;
  linkAccount(input: Omit<AccountRecord, "id">): Promise<AccountRecord>;

  createVerificationToken(token: VerificationTokenRecord): Promise<void>;
  /**
   * Atomically look up and consume a verification token. Returns the record if
   * a matching, unexpired token existed (and removes it), else null.
   */
  useVerificationToken(input: {
    identifier: string;
    tokenHash: string;
    purpose: VerificationPurpose;
  }): Promise<VerificationTokenRecord | null>;
  deleteVerificationTokens(
    identifier: string,
    purpose: VerificationPurpose,
  ): Promise<void>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * MemoryAuthAdapter — in-process reference implementation. Data is lost on
 * restart and not shared across processes, so it is for local dev, tests and
 * prototypes only. Implement AuthAdapter against a real database for
 * production. Email lookups are case-insensitive.
 */
export class MemoryAuthAdapter implements AuthAdapter {
  private users = new Map<string, AuthUserRecord>();
  private emailIndex = new Map<string, string>(); // email -> userId
  private sessions = new Map<string, SessionRecord>();
  private accounts = new Map<string, AccountRecord>(); // provider:accountId -> record
  private verifications: VerificationTokenRecord[] = [];

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    const email = normalizeEmail(input.email);
    if (this.emailIndex.has(email)) {
      throw new Error("User with this email already exists");
    }
    const now = Date.now();
    const { email: _e, ...rest } = input;
    const user: AuthUserRecord = {
      ...rest,
      id: crypto.randomUUID(),
      email,
      emailVerified: input.emailVerified ?? null,
      passwordHash: input.passwordHash ?? null,
      roles: input.roles ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.emailIndex.set(email, user.id);
    return { ...user };
  }

  async getUserById(id: string): Promise<AuthUserRecord | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async getUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const id = this.emailIndex.get(normalizeEmail(email));
    if (!id) return null;
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async updateUser(
    id: string,
    patch: Partial<AuthUserRecord>,
  ): Promise<AuthUserRecord | null> {
    const existing = this.users.get(id);
    if (!existing) return null;
    if (patch.email && normalizeEmail(patch.email) !== existing.email) {
      const next = normalizeEmail(patch.email);
      if (this.emailIndex.has(next)) {
        throw new Error("User with this email already exists");
      }
      this.emailIndex.delete(existing.email);
      this.emailIndex.set(next, id);
      patch = { ...patch, email: next };
    }
    const updated: AuthUserRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.users.set(id, updated);
    return { ...updated };
  }

  async createSession(input: {
    userId: string;
    expiresAt: number;
  }): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return { ...session };
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const s = this.sessions.get(id);
    if (!s) return null;
    if (s.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    return { ...s };
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    for (const [id, s] of this.sessions) {
      if (s.userId === userId) this.sessions.delete(id);
    }
  }

  async getAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<AccountRecord | null> {
    const a = this.accounts.get(`${provider}:${providerAccountId}`);
    return a ? { ...a } : null;
  }

  async linkAccount(input: Omit<AccountRecord, "id">): Promise<AccountRecord> {
    const account: AccountRecord = { ...input, id: crypto.randomUUID() };
    this.accounts.set(`${input.provider}:${input.providerAccountId}`, account);
    return { ...account };
  }

  async createVerificationToken(token: VerificationTokenRecord): Promise<void> {
    // Opportunistically prune expired tokens so the array can't grow unbounded.
    const now = Date.now();
    if (this.verifications.length > 0) {
      this.verifications = this.verifications.filter((v) => v.expiresAt > now);
    }
    this.verifications.push({ ...token });
  }

  async useVerificationToken(input: {
    identifier: string;
    tokenHash: string;
    purpose: VerificationPurpose;
  }): Promise<VerificationTokenRecord | null> {
    const identifier = normalizeEmail(input.identifier);
    const idx = this.verifications.findIndex(
      (v) =>
        v.identifier === identifier &&
        v.tokenHash === input.tokenHash &&
        v.purpose === input.purpose,
    );
    if (idx === -1) return null;
    const [record] = this.verifications.splice(idx, 1);
    if (!record || record.expiresAt <= Date.now()) return null;
    return record;
  }

  async deleteVerificationTokens(
    identifier: string,
    purpose: VerificationPurpose,
  ): Promise<void> {
    const norm = normalizeEmail(identifier);
    this.verifications = this.verifications.filter(
      (v) => !(v.identifier === norm && v.purpose === purpose),
    );
  }

  /** Test/dev helper: wipe all data. */
  __reset(): void {
    this.users.clear();
    this.emailIndex.clear();
    this.sessions.clear();
    this.accounts.clear();
    this.verifications = [];
  }
}

/**
 * $sanitizeUser — strips secret fields (password hash) before a user object is
 * ever sent to the client or embedded in a token. Always run auth records
 * through this at the boundary.
 */
export function $sanitizeUser(
  user: AuthUserRecord | Record<string, unknown>,
): Record<string, unknown> {
  const {
    passwordHash: _p,
    ...safe
  } = user as AuthUserRecord;
  return safe;
}

export { normalizeEmail as __normalizeEmail };
