import { z } from "zod";

export const sessionSchema = z
  .object({
    user: z
      .object({
        id: z.string(),
        username: z.string(),
      })
      .passthrough(),
    expires_at: z.string(),
  })
  .passthrough();
