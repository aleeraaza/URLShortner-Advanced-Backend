import { z } from "zod";

export const urlSchema = z.object({

});

export type UrlInputType = z.infer<typeof urlSchema>;