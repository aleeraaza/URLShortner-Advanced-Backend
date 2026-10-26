/// <reference types="node" />
import "dotenv/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";

const connection = process.env["DIRECT_URL"] || process.env["DATABASE_URL"];

if (!connection) {
  throw new Error("Set DATABASE_URL in .env before running Prisma.");
}

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./prisma/contract.prisma",
    output: "./src/generated/prisma",
    migrations: {
      dir: "./prisma/migrations",
    },
    db: {
      connection,
    },
  }),
  skills: {
    check: false,
  },
});
