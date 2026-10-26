import dotenv from "dotenv";
dotenv.config({
  path: "./.env",
});
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.string(),
  PORT: z.coerce.number(),
  FRONTEND_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  // Optional. Prisma CLI uses this when set, so migrations can use Neon's
  // direct URL while the app uses the pooled DATABASE_URL.
  DIRECT_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .regex(/^\d+(s|m|h|d)$/)
    .default("15m"),
  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .regex(/^\d+(s|m|h|d)$/)
    .default("7d"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("invalid env variables: ", z.treeifyError(parsedEnv.error));

  process.exit(1);
}

export const env = parsedEnv.data;
