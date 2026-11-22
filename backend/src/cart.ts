export type CartTotalsInputItem = {
  productId: string;
  quantity: number;
  priceCents: number;
};

export type CartTotalsLine = {
  productId: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
};

export type CartTotalsResult = {
  items: CartTotalsLine[];
  cartTotalCents: number;
};

export function calculateCartTotals(items: CartTotalsInputItem[]): CartTotalsResult {
  const lines = items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    priceCents: item.priceCents,
    lineTotalCents: item.quantity * item.priceCents
  }));

  const cartTotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

  return {
    items: lines,
    cartTotalCents
  };
}
