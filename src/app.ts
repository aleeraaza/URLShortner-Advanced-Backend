import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { env } from "./config/env.config.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { httpLogger } from "./middlewares/logger.middleware.js";
import { securityMiddleware } from "./middlewares/security.middleware.js";
import { authRouter } from "./modules/auth/auth.container.js";

export const app = express();

app.use(securityMiddleware);
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(httpLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: "Backend working fine.",
    status: "healthy",
  });
});

app.use("/api/auth", authRouter);
app.use(errorMiddleware);
