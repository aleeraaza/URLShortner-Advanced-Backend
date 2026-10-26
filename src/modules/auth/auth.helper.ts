import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Temporal } from "temporal-polyfill";
import { env } from "../../config/env.config.js";
import { AppError } from "../../errors/AppError.js";
import {
  ACCESS_COOKIE,
  BCRYPT_ROUNDS,
  REFRESH_COOKIE,
} from "./auth.constants.js";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "./auth.types.js";

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function durationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) {
    throw new AppError("Invalid token duration", 500);
  }

  return Number(match[1]) * DURATION_UNITS[match[2]];
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function refreshExpiry(): Temporal.Instant {
  return Temporal.Now.instant().add({
    milliseconds: durationMs(env.JWT_REFRESH_EXPIRES_IN),
  });
}

export function signAccessToken(input: {
  userId: string;
  email: string;
  sessionId: string;
}): string {
  const payload: AccessTokenPayload = {
    sub: input.userId,
    email: input.email,
    sessionId: input.sessionId,
    type: "access",
  };

  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: Math.floor(durationMs(env.JWT_ACCESS_EXPIRES_IN) / 1000),
  });
}

export function signRefreshToken(input: {
  userId: string;
  sessionId: string;
}): string {
  const payload: RefreshTokenPayload = {
    sub: input.userId,
    sessionId: input.sessionId,
    type: "refresh",
  };

  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: Math.floor(durationMs(env.JWT_REFRESH_EXPIRES_IN) / 1000),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (
      !isRecord(decoded) ||
      decoded.type !== "access" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.email !== "string" ||
      typeof decoded.sessionId !== "string"
    ) {
      throw new AppError("Unauthorized", 401);
    }

    return {
      sub: decoded.sub,
      email: decoded.email,
      sessionId: decoded.sessionId,
      type: "access",
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Unauthorized", 401);
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (
      !isRecord(decoded) ||
      decoded.type !== "refresh" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.sessionId !== "string"
    ) {
      throw new AppError("Unauthorized", 401);
    }

    return {
      sub: decoded.sub,
      sessionId: decoded.sessionId,
      type: "refresh",
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Unauthorized", 401);
  }
}

function cookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(
    ACCESS_COOKIE,
    tokens.accessToken,
    cookieOptions(durationMs(env.JWT_ACCESS_EXPIRES_IN)),
  );
  res.cookie(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(durationMs(env.JWT_REFRESH_EXPIRES_IN)),
  );
}

export function clearAuthCookies(res: Response): void {
  const options = cookieOptions(0);
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

export function readAccessToken(req: Request): string | undefined {
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) return token;
  }

  const cookie = req.cookies?.[ACCESS_COOKIE];
  return typeof cookie === "string" && cookie.length > 0 ? cookie : undefined;
}

export function readRefreshToken(req: Request): string | undefined {
  const bodyToken = req.body?.refreshToken;
  if (typeof bodyToken === "string" && bodyToken.length > 0) {
    return bodyToken;
  }

  const cookie = req.cookies?.[REFRESH_COOKIE];
  return typeof cookie === "string" && cookie.length > 0 ? cookie : undefined;
}
