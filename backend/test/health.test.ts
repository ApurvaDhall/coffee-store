import { describe, expect, it } from "vitest";
import { app } from "../src/index";

describe("GET /health", () => {
  it("returns status ok", async () => {
    const response = await app.request("/health");
    const body = await response.json<{ status: string }>();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });
});
