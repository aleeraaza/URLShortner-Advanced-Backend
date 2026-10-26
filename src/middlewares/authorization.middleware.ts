import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import type { UserRole } from "../modules/auth/auth.types.js";

export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError("Unauthorized", 401));
      return;
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      next(new AppError("Forbidden", 403));
      return;
    }

    next();
  };
