import { describe, expect, it } from "vitest";
import { calculateOrderTotalCents } from "../src/orders";

describe("calculateOrderTotalCents", () => {
  it("calculates total from quantity and current prices", () => {
    const total = calculateOrderTotalCents([
      { quantity: 2, priceCents: 1599 },
      { quantity: 1, priceCents: 2200 },
      { quantity: 3, priceCents: 875 }
    ]);

    expect(total).toBe(8023);
  });

  it("returns 0 for empty item list", () => {
    expect(calculateOrderTotalCents([])).toBe(0);
  });
});
