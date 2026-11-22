export type Product = {
  id: string;
  name: string;
  origin: string;
  roast_level: string;
  price_cents: number;
  image_url: string | null;
  description: string | null;
  stock: number;
  created_at: string;
};

export type AuthUser = {
  id: string;
  google_sub: string;
  email: string;
  name: string;
};

export type AuthMeResponse = {
  user: AuthUser;
  isAdmin: boolean;
};

export type CartItem = {
  productId: string;
  quantity: number;
  lineTotalCents: number;
  product: {
    id: string;
    name: string;
    origin: string;
    roastLevel: string;
    priceCents: number;
    imageUrl: string | null;
    description: string | null;
    stock: number;
  };
};

export type CartResponse = {
  items: CartItem[];
  cartTotalCents: number;
};

export type CreateOrderInput = {
  shippingName: string;
  shippingAddress: string;
};

export type OrderItem = {
  id: string;
  productId: string;
  nameSnapshot: string;
  priceCentsSnapshot: number;
  quantity: number;
  lineTotalCents: number;
};

export type Order = {
  id: string;
  idempotencyKey: string;
  totalCents: number;
  status: string;
  shippingName: string;
  shippingAddress: string;
  createdAt: string;
  items: OrderItem[];
};

export type OrderListItem = {
  id: string;
  idempotencyKey: string;
  totalCents: number;
  status: string;
  shippingName: string;
  shippingAddress: string;
  createdAt: string;
};

export type ProductQuery = {
  q?: string;
  roast?: string;
  origin?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
};

export type ProductListResponse = {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
};

export type OrderListResponse = {
  items: OrderListItem[];
};

export type AdminProductInput = {
  name: string;
  origin: string;
  roast_level: "light" | "medium" | "dark";
  price_cents: number;
  image_url: string;
  description: string;
  stock: number;
};

export type AdminProductListResponse = {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminOrderListResponse = {
  items: OrderListItem[];
  page: number;
  pageSize: number;
  total: number;
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/$/, "");

function toUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_URL is not configured.");
  }
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getGoogleAuthStartUrl(): string {
  return toUrl("/api/auth/google");
}

export function getLogoutUrl(): string {
  return toUrl("/api/auth/logout");
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(toUrl(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    const serverMessage = payload?.error?.message ?? "Request failed";
    const message = `${serverMessage} (HTTP ${response.status}${payload?.error?.code ? ` ${payload.error.code}` : ""})`;
    throw new ApiError(response.status, message, payload?.error?.code);
  }

  return (await response.json()) as T;
}

export async function getProducts(params: ProductQuery): Promise<ProductListResponse> {
  const query = new URLSearchParams();

  if (params.q) {
    query.set("q", params.q);
  }
  if (params.roast) {
    query.set("roast", params.roast);
  }
  if (params.origin) {
    query.set("origin", params.origin);
  }
  if (params.minPrice !== undefined) {
    query.set("minPrice", String(params.minPrice));
  }
  if (params.maxPrice !== undefined) {
    query.set("maxPrice", String(params.maxPrice));
  }
  if (params.page !== undefined) {
    query.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    query.set("pageSize", String(params.pageSize));
  }

  const suffix = query.toString();
  return apiFetch<ProductListResponse>(`/api/products${suffix ? `?${suffix}` : ""}`);
}

export async function getProductById(productId: string): Promise<Product> {
  return apiFetch<Product>(`/api/products/${encodeURIComponent(productId)}`);
}

export async function setCartItemQuantity(productId: string, quantity: number): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/cart/items/${encodeURIComponent(productId)}`, {
    method: "PUT",
    body: JSON.stringify({ quantity })
  });
}

const GUEST_CART_STORAGE_KEY = "roast-republic-guest-cart";

export type GuestCart = Record<string, number>;

export function getGuestCart(): GuestCart {
  try {
    const value = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, number] =>
          typeof entry[1] === "number" &&
          Number.isInteger(entry[1]) &&
          entry[1] > 0 &&
          entry[1] <= 20
        )
    );
  } catch {
    return {};
  }
}

export function setGuestCart(cart: GuestCart): void {
  window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(cart));
}

export function clearGuestCart(): void {
  window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
}

export async function getAuthMe(): Promise<AuthMeResponse> {
  return apiFetch<AuthMeResponse>("/api/auth/me");
}

export async function postLogout(): Promise<void> {
  await apiFetch<{ ok: true }>("/api/auth/logout", {
    method: "POST"
  });
}

export async function getCart(): Promise<CartResponse> {
  return apiFetch<CartResponse>("/api/cart");
}

export async function deleteCartItem(productId: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/cart/items/${encodeURIComponent(productId)}`, {
    method: "DELETE"
  });
}

export async function createOrder(input: CreateOrderInput, idempotencyKey: string): Promise<Order> {
  return apiFetch<Order>("/api/orders", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(input)
  });
}

export async function getOrderById(orderId: string): Promise<Order> {
  return apiFetch<Order>(`/api/orders/${encodeURIComponent(orderId)}`);
}

export async function getOrders(): Promise<OrderListResponse> {
  return apiFetch<OrderListResponse>("/api/orders");
}

export async function getAdminProducts(params: {
  page?: number;
  pageSize?: number;
}): Promise<AdminProductListResponse> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.pageSize !== undefined) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString();
  return apiFetch<AdminProductListResponse>(`/api/admin/products${suffix ? `?${suffix}` : ""}`);
}

export async function createAdminProduct(input: AdminProductInput): Promise<Product> {
  return apiFetch<Product>("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateAdminProduct(productId: string, input: AdminProductInput): Promise<Product> {
  return apiFetch<Product>(`/api/admin/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function getAdminOrders(params: {
  page?: number;
  pageSize?: number;
}): Promise<AdminOrderListResponse> {
  const query = new URLSearchParams();
  if (params.page !== undefined) query.set("page", String(params.page));
  if (params.pageSize !== undefined) query.set("pageSize", String(params.pageSize));
  const suffix = query.toString();
  return apiFetch<AdminOrderListResponse>(`/api/admin/orders${suffix ? `?${suffix}` : ""}`);
}

export type OrderStatus = "paid" | "processing" | "shipped" | "delivered" | "cancelled";

export async function updateAdminOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  await apiFetch<{ ok: true }>(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export type CoffeeFinderMatch = {
  product?: Product;
  id?: string;
  name?: string;
  origin?: string;
  roast_level?: string;
  price_cents?: number;
  image_url?: string | null;
  description?: string | null;
  stock?: number;
  reason: string;
};

export type CoffeeFinderResponse = {
  source: "ai" | "fallback" | string;
  items: CoffeeFinderMatch[];
};

export async function findCoffee(query: string): Promise<CoffeeFinderResponse> {
  return apiFetch<CoffeeFinderResponse>("/api/ai/coffee-finder", {
    method: "POST",
    body: JSON.stringify({ query })
  });
}
