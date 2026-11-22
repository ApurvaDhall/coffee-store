export type OrderTotalItem = {
  quantity: number;
  priceCents: number;
};

export function calculateOrderTotalCents(items: OrderTotalItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.priceCents, 0);
}
