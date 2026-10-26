import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { readAccessToken, verifyAccessToken } from "../modules/auth/auth.helper.js";

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const token = readAccessToken(req);
    if (!token) {
      throw new AppError("Unauthorized", 401);
    }

    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      sessionId: payload.sessionId,
      role: "USER",
    };
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError("Unauthorized", 401));
  }
};
