import type { ErrorRequestHandler } from "express";
import { logger } from "../config/logger.js";
import { AppError } from "../errors/AppError.js";

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};
