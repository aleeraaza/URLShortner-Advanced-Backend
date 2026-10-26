import "temporal-polyfill/global";
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import type { Contract } from "../generated/prisma/contract.js";
import contractJson from "../generated/prisma/contract.json" with { type: "json" };
import { env } from "./env.config.js";

const contract = contractFromJson<Contract>(contractJson);

export const db = postgres({
  contract,
  url: env.DATABASE_URL,
});
