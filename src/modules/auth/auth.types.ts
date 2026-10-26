export type UserRole = "USER" | "ADMIN";

export type AuthUser = {
  id: string;
  email: string;
  sessionId: string;
  role: UserRole;
};

export type AccessTokenPayload = {
  sub: string;
  email: string;
  sessionId: string;
  type: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  sessionId: string;
  type: "refresh";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
