import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { AppError } from "../../errors/AppError.js";
import type { RequestMeta } from "./auth.interface.js";
import {
  clearAuthCookies,
  readRefreshToken,
  setAuthCookies,
} from "./auth.helper.js";
import type { AuthService } from "./auth.service.js";

function requestMeta(req: Request): RequestMeta {
  return {
    userAgent: req.get("user-agent") ?? undefined,
    ipAddress: req.ip,
  };
}

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  return req.user;
}

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = catchAsync(async (req: Request, res: Response) => {
    const result = await this.service.register(req.body, requestMeta(req));
    setAuthCookies(res, result);
    res.status(201).json({
      success: true,
      message: "Registered",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  login = catchAsync(async (req: Request, res: Response) => {
    const result = await this.service.login(req.body, requestMeta(req));
    setAuthCookies(res, result);
    res.status(200).json({
      success: true,
      message: "Logged in",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  me = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const profile = await this.service.me(user.id);
    res.status(200).json({
      success: true,
      data: { user: profile },
    });
  });

  refresh = catchAsync(async (req: Request, res: Response) => {
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) {
      throw new AppError("Refresh token missing", 401);
    }

    const result = await this.service.refresh(refreshToken);
    setAuthCookies(res, result);
    res.status(200).json({
      success: true,
      message: "Token refreshed",
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  });

  logout = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    await this.service.logout(user.sessionId);
    clearAuthCookies(res);
    res.status(200).json({
      success: true,
      message: "Logged out",
    });
  });

  logoutAll = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    await this.service.logoutAll(user.id);
    clearAuthCookies(res);
    res.status(200).json({
      success: true,
      message: "Logged out of all devices",
    });
  });
}
