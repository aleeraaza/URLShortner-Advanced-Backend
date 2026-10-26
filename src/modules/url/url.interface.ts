import type { Models } from "../../generated/prisma/contract.js";
import type { UrlInputType } from "./url.schema.js";

export type ShortUrl = Models.public_ShortUrl;

export interface IUrlRepository {
  createShortUrl(data: UrlInputType): Promise<ShortUrl>;
}