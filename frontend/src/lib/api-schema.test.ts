import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiContractError, apiFetchSchema } from "./api-schema";

describe("apiFetchSchema", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns parsed data for a valid contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ count: 3 }), { status: 200 })));

    await expect(apiFetchSchema("/api/count", z.object({ count: z.number() }))).resolves.toEqual({ count: 3 });
  });

  it("turns invalid payloads into a contract error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ count: "3" }), { status: 200 })));

    await expect(apiFetchSchema("/api/count", z.object({ count: z.number() }))).rejects.toBeInstanceOf(ApiContractError);
  });
});
