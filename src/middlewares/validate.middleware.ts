import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/AppError.js";

type ValidateTarget = "body" | "query" | "params";

export const validate =
  (schema: ZodType, target: ValidateTarget = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = result.error.issues.map((error) => ({
        field: error.path.join("."),
        message: error.message,
      }));

      throw new AppError(
        errors
          .map((error) => `${error.field}: ${error.message}`)
          .join(", "),
        400,
      );
    }

    req[target] = result.data;
    next();
  };

export const validateParams = (schema: ZodType) => validate(schema, "params");
