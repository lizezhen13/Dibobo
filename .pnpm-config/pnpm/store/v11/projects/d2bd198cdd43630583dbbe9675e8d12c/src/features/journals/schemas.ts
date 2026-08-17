import { z } from "zod";

export const journalSchema = z
  .object({
    id: z.string(),
    journal_date: z.string(),
    title: z.string(),
    content: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

export const journalListSchema = z
  .object({
    items: z.array(journalSchema),
    page: z.number(),
    page_size: z.number(),
    total: z.number(),
    total_pages: z.number(),
  })
  .passthrough();
