import type { Temporal } from "temporal-polyfill";

export type PublicUser = {
  id: string;
  email: string;
  createdAt: string;
};

export type UserRecord = PublicUser & {
  passwordHash: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Temporal.Instant;
};

export type RequestMeta = {
  userAgent?: string;
  ipAddress?: string;
};

export type AuthTokens = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(input: { email: string; passwordHash: string }): Promise<UserRecord>;
  createSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Temporal.Instant;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<SessionRecord>;
  findSessionById(id: string): Promise<SessionRecord | null>;
  updateSession(
    id: string,
    input: { refreshTokenHash: string; expiresAt: Temporal.Instant },
  ): Promise<void>;
  deleteSession(id: string): Promise<void>;
  deleteAllSessions(userId: string): Promise<void>;
}
