import { describe, expect, it } from "vitest";
import { calculateCartTotals } from "../src/cart";

describe("calculateCartTotals", () => {
  it("calculates line totals and cart total", () => {
    const result = calculateCartTotals([
      { productId: "p1", quantity: 2, priceCents: 1500 },
      { productId: "p2", quantity: 1, priceCents: 2200 },
      { productId: "p3", quantity: 3, priceCents: 900 }
    ]);

    expect(result.items).toEqual([
      { productId: "p1", quantity: 2, priceCents: 1500, lineTotalCents: 3000 },
      { productId: "p2", quantity: 1, priceCents: 2200, lineTotalCents: 2200 },
      { productId: "p3", quantity: 3, priceCents: 900, lineTotalCents: 2700 }
    ]);
    expect(result.cartTotalCents).toBe(7900);
  });

  it("returns zero total for empty cart", () => {
    const result = calculateCartTotals([]);

    expect(result.items).toEqual([]);
    expect(result.cartTotalCents).toBe(0);
  });

  it("recalculates totals after a quantity change", () => {
    const first = calculateCartTotals([
      { productId: "p1", quantity: 1, priceCents: 1500 }
    ]);
    const changed = calculateCartTotals([
      { productId: "p1", quantity: 3, priceCents: 1500 }
    ]);

    expect(first.cartTotalCents).toBe(1500);
    expect(changed.cartTotalCents).toBe(4500);
    expect(changed.items[0]?.lineTotalCents).toBe(4500);
  });
});
