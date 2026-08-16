import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = "dibobo_csrf=; Max-Age=0; path=/";
  });

  it("adds JSON and CSRF headers for mutating requests", async () => {
    document.cookie = "dibobo_csrf=test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch<{ ok: boolean }>("/api/example", {
      method: "POST",
      body: JSON.stringify({ value: 1 }),
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(request.headers).get("X-CSRF-Token")).toBe("test-token");
    expect(request.credentials).toBe("same-origin");
  });

  it("normalizes API errors and preserves the HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: [{ msg: "Value error, bad input" }] }), { status: 422 })),
    );

    await expect(apiFetch("/api/example", { method: "POST" })).rejects.toMatchObject({
      name: "ApiError",
      message: "bad input",
      status: 422,
    });
  });
});
