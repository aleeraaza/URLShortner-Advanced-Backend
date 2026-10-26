import { db } from "../../config/db.js";
import type {
  AuthRepository,
  SessionRecord,
  UserRecord,
} from "./auth.interface.js";

function toUser(user: {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: { toString(): string };
}): UserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt.toString(),
  };
}

function toSession(session: {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: SessionRecord["expiresAt"];
}): SessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    refreshTokenHash: session.refreshTokenHash,
    expiresAt: session.expiresAt,
  };
}

export class PrismaAuthRepository implements AuthRepository {
  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = await db.orm.public.User.first({ email });
    return user ? toUser(user) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = await db.orm.public.User.first({ id });
    return user ? toUser(user) : null;
  }

  async createUser(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserRecord> {
    const user = await db.orm.public.User.create({
      email: input.email,
      passwordHash: input.passwordHash,
    });
    return toUser(user);
  }

  async createSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: SessionRecord["expiresAt"];
    userAgent?: string;
    ipAddress?: string;
  }): Promise<SessionRecord> {
    const session = await db.orm.public.Session.create({
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
    return toSession(session);
  }

  async findSessionById(id: string): Promise<SessionRecord | null> {
    const session = await db.orm.public.Session.first({ id });
    return session ? toSession(session) : null;
  }

  async updateSession(
    id: string,
    input: {
      refreshTokenHash: string;
      expiresAt: SessionRecord["expiresAt"];
    },
  ): Promise<void> {
    await db.orm.public.Session.where({ id }).update({
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
    });
  }

  async deleteSession(id: string): Promise<void> {
    await db.orm.public.Session.where({ id }).delete();
  }

  async deleteAllSessions(userId: string): Promise<void> {
    await db.orm.public.Session.where({ userId }).deleteAndCount();
  }
}
