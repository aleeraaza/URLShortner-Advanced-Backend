import { AppError } from "../../errors/AppError.js";
import type {
  AuthRepository,
  AuthTokens,
  PublicUser,
  RequestMeta,
} from "./auth.interface.js";
import {
  hashPassword,
  hashToken,
  randomToken,
  refreshExpiry,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from "./auth.helper.js";
import type { LoginInput, RegisterInput } from "./auth.schema.js";

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<AuthTokens> {
    const existing = await this.repository.findUserByEmail(input.email);
    if (existing) {
      throw new AppError("Email already registered", 409);
    }

    const user = await this.repository.createUser({
      email: input.email,
      passwordHash: await hashPassword(input.password),
    });

    return this.openSession(user, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthTokens> {
    const user = await this.repository.findUserByEmail(input.email);
    const passwordMatches = user
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw new AppError("Invalid email or password", 401);
    }

    return this.openSession(user, meta);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new AppError("Unauthorized", 401);
    }

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = verifyRefreshToken(refreshToken);
    const session = await this.repository.findSessionById(payload.sessionId);

    if (!session || session.userId !== payload.sub) {
      throw new AppError("Unauthorized", 401);
    }

    if (session.refreshTokenHash !== hashToken(refreshToken)) {
      await this.repository.deleteAllSessions(session.userId);
      throw new AppError(
        "Refresh token reuse detected. All sessions were revoked.",
        401,
      );
    }

    if (session.expiresAt.epochMilliseconds <= Date.now()) {
      await this.repository.deleteSession(session.id);
      throw new AppError("Refresh token expired", 401);
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user) {
      await this.repository.deleteSession(session.id);
      throw new AppError("Unauthorized", 401);
    }

    const tokens = this.tokensFor(user, session.id);
    await this.repository.updateSession(session.id, {
      refreshTokenHash: hashToken(tokens.refreshToken),
      expiresAt: refreshExpiry(),
    });

    return tokens;
  }

  async logout(sessionId: string): Promise<void> {
    await this.repository.deleteSession(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.repository.deleteAllSessions(userId);
  }

  private async openSession(
    user: PublicUser & { passwordHash: string },
    meta: RequestMeta,
  ): Promise<AuthTokens> {
    const session = await this.repository.createSession({
      userId: user.id,
      refreshTokenHash: hashToken(randomToken()),
      expiresAt: refreshExpiry(),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });
    const tokens = this.tokensFor(user, session.id);

    await this.repository.updateSession(session.id, {
      refreshTokenHash: hashToken(tokens.refreshToken),
      expiresAt: refreshExpiry(),
    });

    return tokens;
  }

  private tokensFor(
    user: PublicUser,
    sessionId: string,
  ): AuthTokens {
    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      accessToken: signAccessToken({
        userId: user.id,
        email: user.email,
        sessionId,
      }),
      refreshToken: signRefreshToken({
        userId: user.id,
        sessionId,
      }),
    };
  }
}
