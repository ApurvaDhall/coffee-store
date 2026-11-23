import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { calculateCartTotals } from "./cart";
import { errorBody } from "./http";
import { calculateOrderTotalCents } from "./orders";
import {
  cookieAttributes,
  parseAdminEmails,
  requireAuth,
  SESSION_COOKIE_NAME,
  type AppBindings,
  type AppVariables,
  type AuthUser
} from "./middleware/auth";
import { adminRoutes } from "./routes/admin";
import { aiRoutes } from "./routes/ai";

type ProductRow = {
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

type CartJoinedRow = {
  product_id: string;
  quantity: number;
  name: string;
  origin: string;
  roast_level: string;
  price_cents: number;
  image_url: string | null;
  description: string | null;
  stock: number;
};

type OrderRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  total_cents: number;
  status: string;
  shipping_name: string;
  shipping_address: string;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  name_snapshot: string;
  price_cents_snapshot: number;
  quantity: number;
};

type CartOrderInputRow = {
  product_id: string;
  quantity: number;
  name: string;
  price_cents: number;
  stock: number;
};

const productQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  roast: z.string().trim().min(1).optional(),
  origin: z.string().trim().min(1).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
});

const cartQuantitySchema = z.object({
  quantity: z.number().int().min(0).max(20)
});

const createOrderSchema = z.object({
  shippingName: z.string().trim().min(1).max(120),
  shippingAddress: z.string().trim().min(1).max(500)
});

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const STATE_TTL_SECONDS = 60 * 10;
const OAUTH_STATE_COOKIE_NAME = "oauth_state";
const OAUTH_PKCE_COOKIE_NAME = "oauth_pkce_verifier";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

app.onError((_error, c) => {
  return c.json(errorBody("INTERNAL_ERROR", "An unexpected error occurred."), 500);
});

app.use("/api/*", async (c, next) => {
  const frontendOrigin = c.env.FRONTEND_ORIGIN?.trim();

  if (!frontendOrigin) {
    return c.json(errorBody("SERVER_CONFIG_ERROR", "FRONTEND_ORIGIN is not configured."), 500);
  }

  const requestOrigin = c.req.header("Origin");
  if (requestOrigin && requestOrigin !== frontendOrigin) {
    if (c.req.method === "OPTIONS") {
      return c.body(null, 403);
    }
    return c.json(errorBody("CORS_ERROR", "Origin is not allowed."), 403);
  }

  if (c.req.method === "OPTIONS") {
    c.header("Access-Control-Allow-Origin", frontendOrigin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type,Idempotency-Key");
    c.header("Access-Control-Max-Age", "86400");
    return c.body(null, 204);
  }

  return cors({
    origin: frontendOrigin,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Idempotency-Key"]
  })(c, next);
});

function parseTotalValue(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function randomBase64Url(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function oauthRedirectUri(
  c: Context<{ Bindings: AppBindings; Variables: AppVariables }>
): string {
  if (c.env.OAUTH_REDIRECT_URI?.trim()) {
    return c.env.OAUTH_REDIRECT_URI.trim();
  }

  const frontendOrigin = new URL(c.env.FRONTEND_ORIGIN);
  const forwardedHost = c.req.header("X-Forwarded-Host")?.trim();
  if (forwardedHost && forwardedHost === frontendOrigin.host) {
    return `${frontendOrigin.protocol}//${forwardedHost}/api/auth/google/callback`;
  }

  return `${frontendOrigin.origin}/api/auth/google/callback`;
}

async function getOrderWithItems(
  c: Context<{ Bindings: AppBindings; Variables: AppVariables }>,
  orderId: string,
  userId: string
) {
  const order = await c.env.DB.prepare(
    `
      SELECT
        id,
        user_id,
        idempotency_key,
        total_cents,
        status,
        shipping_name,
        shipping_address,
        created_at
      FROM orders
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `
  )
    .bind(orderId, userId)
    .first<OrderRow>();

  if (!order) {
    return null;
  }

  const items = await c.env.DB.prepare(
    `
      SELECT
        id,
        order_id,
        product_id,
        name_snapshot,
        price_cents_snapshot,
        quantity
      FROM order_items
      WHERE order_id = ?
      ORDER BY id ASC
    `
  )
    .bind(order.id)
    .all<OrderItemRow>();

  return {
    id: order.id,
    idempotencyKey: order.idempotency_key,
    totalCents: order.total_cents,
    status: order.status,
    shippingName: order.shipping_name,
    shippingAddress: order.shipping_address,
    createdAt: order.created_at,
    items: items.results.map((item) => ({
      id: item.id,
      productId: item.product_id,
      nameSnapshot: item.name_snapshot,
      priceCentsSnapshot: item.price_cents_snapshot,
      quantity: item.quantity,
      lineTotalCents: item.price_cents_snapshot * item.quantity
    }))
  };
}

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/api/auth/google", async (c) => {
  const state = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const redirectUri = oauthRedirectUri(c);
  const cookieOptions = cookieAttributes();

  setCookie(c, OAUTH_STATE_COOKIE_NAME, state, {
    ...cookieOptions,
    maxAge: STATE_TTL_SECONDS,
    path: "/"
  });

  setCookie(c, OAUTH_PKCE_COOKIE_NAME, codeVerifier, {
    ...cookieOptions,
    maxAge: STATE_TTL_SECONDS,
    path: "/"
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return c.redirect(authUrl.toString(), 302);
});

app.get("/api/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = getCookie(c, OAUTH_STATE_COOKIE_NAME);
  const codeVerifier = getCookie(c, OAUTH_PKCE_COOKIE_NAME);

  const oauthCookieOptions = cookieAttributes();
  deleteCookie(c, OAUTH_STATE_COOKIE_NAME, { path: "/", ...oauthCookieOptions });
  deleteCookie(c, OAUTH_PKCE_COOKIE_NAME, { path: "/", ...oauthCookieOptions });

  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    return c.json(errorBody("INVALID_OAUTH_STATE", "Invalid OAuth state."), 400);
  }

  const redirectUri = oauthRedirectUri(c);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier
    }).toString()
  });

  if (!tokenResponse.ok) {
    return c.json(errorBody("OAUTH_EXCHANGE_FAILED", "Failed to exchange OAuth code."), 502);
  }

  const tokenJson = await tokenResponse.json();
  const tokenSchema = z.object({
    id_token: z.string().min(1)
  });
  const tokenParsed = tokenSchema.safeParse(tokenJson);
  if (!tokenParsed.success) {
    return c.json(errorBody("OAUTH_EXCHANGE_FAILED", "Missing ID token in OAuth response."), 502);
  }

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];

  try {
    const verified = await jwtVerify(tokenParsed.data.id_token, GOOGLE_JWKS, {
      audience: c.env.GOOGLE_CLIENT_ID,
      issuer: ["https://accounts.google.com", "accounts.google.com"]
    });
    payload = verified.payload;
  } catch {
    return c.json(errorBody("INVALID_ID_TOKEN", "Invalid Google ID token."), 401);
  }

  const userClaimsSchema = z.object({
    sub: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1)
  });
  const claimsParsed = userClaimsSchema.safeParse(payload);
  if (!claimsParsed.success) {
    return c.json(errorBody("INVALID_ID_TOKEN", "Missing required claims in ID token."), 401);
  }

  const { sub, email, name } = claimsParsed.data;

  const existingUser = await c.env.DB.prepare("SELECT id FROM users WHERE google_sub = ? LIMIT 1")
    .bind(sub)
    .first<{ id: string }>();

  let userId = existingUser?.id;
  if (!userId) {
    userId = `usr_${crypto.randomUUID()}`;
    await c.env.DB.prepare(
      "INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
    )
      .bind(userId, sub, email, name)
      .run();
  } else {
    await c.env.DB.prepare("UPDATE users SET email = ?, name = ? WHERE id = ?")
      .bind(email, name, userId)
      .run();
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, userId, expiresAt)
    .run();

  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    ...cookieAttributes(),
    maxAge: SESSION_TTL_SECONDS,
    path: "/"
  });

  return c.redirect(c.env.FRONTEND_ORIGIN, 302);
});

app.get("/api/auth/me", requireAuth, (c) => {
  const user = c.get("user") as AuthUser;
  const admins = parseAdminEmails(c.env.ADMIN_EMAILS);

  return c.json({
    user,
    isAdmin: admins.has(user.email.toLowerCase())
  });
});

app.post("/api/auth/logout", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);

  if (sessionId) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }

  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
    ...cookieAttributes()
  });

  return c.redirect(c.env.FRONTEND_ORIGIN, 302);
});

app.get("/api/auth/logout", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);

  if (sessionId) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }

  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
    ...cookieAttributes()
  });

  return c.redirect(c.env.FRONTEND_ORIGIN, 302);
});

app.get("/api/cart", requireAuth, async (c) => {
  const user = c.get("user") as AuthUser;

  const result = await c.env.DB.prepare(
    `
      SELECT
        ci.product_id,
        ci.quantity,
        p.name,
        p.origin,
        p.roast_level,
        p.price_cents,
        p.image_url,
        p.description,
        p.stock
      FROM cart_items ci
      INNER JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = ?
      ORDER BY p.name ASC
    `
  )
    .bind(user.id)
    .all<CartJoinedRow>();

  const totals = calculateCartTotals(
    result.results.map((row) => ({
      productId: row.product_id,
      quantity: row.quantity,
      priceCents: row.price_cents
    }))
  );

  return c.json({
    items: result.results.map((row) => {
      const line = totals.items.find((item) => item.productId === row.product_id);

      return {
        productId: row.product_id,
        quantity: row.quantity,
        lineTotalCents: line?.lineTotalCents ?? 0,
        product: {
          id: row.product_id,
          name: row.name,
          origin: row.origin,
          roastLevel: row.roast_level,
          priceCents: row.price_cents,
          imageUrl: row.image_url,
          description: row.description,
          stock: row.stock
        }
      };
    }),
    cartTotalCents: totals.cartTotalCents
  });
});

app.put("/api/cart/items/:productId", requireAuth, async (c) => {
  const user = c.get("user") as AuthUser;
  const { productId } = c.req.param();

  if (!productId) {
    return c.json(errorBody("VALIDATION_ERROR", "productId is required."), 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody("VALIDATION_ERROR", "Request body must be valid JSON."), 400);
  }

  const parsed = cartQuantitySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      errorBody("VALIDATION_ERROR", "quantity must be 0 (remove) or an integer between 1 and 20."),
      400
    );
  }

  const { quantity } = parsed.data;

  const product = await c.env.DB.prepare("SELECT id FROM products WHERE id = ? LIMIT 1")
    .bind(productId)
    .first<{ id: string; stock: number }>();

  if (!product) {
    return c.json(errorBody("NOT_FOUND", "Product not found."), 404);
  }

  if (quantity > product.stock) {
    return c.json(errorBody("INSUFFICIENT_STOCK", "Quantity exceeds available stock."), 409);
  }

  if (quantity === 0) {
    await c.env.DB.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?")
      .bind(user.id, productId)
      .run();

    return c.json({ ok: true });
  }

  await c.env.DB.prepare(
    `
      INSERT INTO cart_items (user_id, product_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, product_id)
      DO UPDATE SET quantity = excluded.quantity
    `
  )
    .bind(user.id, productId, quantity)
    .run();

  return c.json({ ok: true });
});

app.delete("/api/cart/items/:productId", requireAuth, async (c) => {
  const user = c.get("user") as AuthUser;
  const { productId } = c.req.param();

  if (!productId) {
    return c.json(errorBody("VALIDATION_ERROR", "productId is required."), 400);
  }

  await c.env.DB.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?")
    .bind(user.id, productId)
    .run();

  return c.json({ ok: true });
});

app.post("/api/orders", requireAuth, async (c) => {
  const user = c.get("user") as AuthUser;
  const idempotencyKey = c.req.header("Idempotency-Key")?.trim();

  if (!idempotencyKey) {
    return c.json(errorBody("VALIDATION_ERROR", "Idempotency-Key header is required."), 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody("VALIDATION_ERROR", "Request body must be valid JSON."), 400);
  }

  const parsedBody = createOrderSchema.safeParse(body);
  if (!parsedBody.success) {
    return c.json(errorBody("VALIDATION_ERROR", "Invalid shipping details."), 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1"
  )
    .bind(user.id, idempotencyKey)
    .first<{ id: string }>();

  if (existing) {
    const existingOrder = await getOrderWithItems(c, existing.id, user.id);
    if (!existingOrder) {
      return c.json(errorBody("NOT_FOUND", "Order not found."), 404);
    }
    return c.json(existingOrder, 200);
  }

  const cart = await c.env.DB.prepare(
    `
      SELECT
        ci.product_id,
        ci.quantity,
        p.name,
        p.price_cents,
        p.stock
      FROM cart_items ci
      INNER JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = ?
      ORDER BY p.name ASC
    `
  )
    .bind(user.id)
    .all<CartOrderInputRow>();

  if (cart.results.length === 0) {
    return c.json(errorBody("EMPTY_CART", "Cart is empty."), 400);
  }

  const insufficientStock = cart.results.some((item) => item.quantity > item.stock);
  if (insufficientStock) {
    return c.json(errorBody("INSUFFICIENT_STOCK", "One or more items are out of stock."), 409);
  }

  const totalCents = calculateOrderTotalCents(
    cart.results.map((item) => ({
      quantity: item.quantity,
      priceCents: item.price_cents
    }))
  );

  const orderId = `ord_${crypto.randomUUID()}`;
  const { shippingName, shippingAddress } = parsedBody.data;
  const orderStatus = "paid";

  const statements: D1PreparedStatement[] = [];

  for (const item of cart.results) {
    statements.push(
      c.env.DB.prepare(
        "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?"
      ).bind(item.quantity, item.product_id, item.quantity)
    );
  }

  statements.push(
    c.env.DB.prepare(
      `
        INSERT INTO orders (
          id,
          user_id,
          idempotency_key,
          total_cents,
          status,
          shipping_name,
          shipping_address,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
    ).bind(
      orderId,
      user.id,
      idempotencyKey,
      totalCents,
      orderStatus,
      shippingName,
      shippingAddress
    )
  );

  for (const item of cart.results) {
    statements.push(
      c.env.DB.prepare(
        `
          INSERT INTO order_items (
            id,
            order_id,
            product_id,
            name_snapshot,
            price_cents_snapshot,
            quantity
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `
      ).bind(
        `oi_${crypto.randomUUID()}`,
        orderId,
        item.product_id,
        item.name,
        item.price_cents,
        item.quantity
      )
    );
  }

  statements.push(c.env.DB.prepare("DELETE FROM cart_items WHERE user_id = ?").bind(user.id));

  try {
    const results = await c.env.DB.batch(statements);
    const stockResults = results.slice(0, cart.results.length) as Array<{
      meta?: { changes?: number };
    }>;

    const hasStockFailure = stockResults.some((result) => (result.meta?.changes ?? 0) === 0);

    if (hasStockFailure) {
      return c.json(errorBody("INSUFFICIENT_STOCK", "One or more items are out of stock."), 409);
    }
  } catch {
    return c.json(errorBody("ORDER_CREATE_FAILED", "Failed to create order."), 500);
  }

  const created = await getOrderWithItems(c, orderId, user.id);
  if (!created) {
    return c.json(errorBody("ORDER_CREATE_FAILED", "Failed to create order."), 500);
  }

  return c.json(created, 201);
});

app.get("/api/orders", requireAuth, async (c) => {
  const user = c.get("user") as AuthUser;

  const orders = await c.env.DB.prepare(
    `
      SELECT
        id,
        idempotency_key,
        total_cents,
        status,
        shipping_name,
        shipping_address,
        created_at
      FROM orders
      WHERE user_id = ?
      ORDER BY created_at DESC
    `
  )
    .bind(user.id)
    .all<Pick<OrderRow, "id" | "idempotency_key" | "total_cents" | "status" | "shipping_name" | "shipping_address" | "created_at">>();

  return c.json({
    items: orders.results.map((order) => ({
      id: order.id,
      idempotencyKey: order.idempotency_key,
      totalCents: order.total_cents,
      status: order.status,
      shippingName: order.shipping_name,
      shippingAddress: order.shipping_address,
      createdAt: order.created_at
    }))
  });
});

app.get("/api/orders/:id", requireAuth, async (c) => {
  const user = c.get("user") as AuthUser;
  const { id } = c.req.param();

  const order = await getOrderWithItems(c, id, user.id);
  if (!order) {
    return c.json(errorBody("NOT_FOUND", "Order not found."), 404);
  }

  return c.json(order);
});

app.get("/api/products", async (c) => {
  const parsed = productQuerySchema.safeParse(c.req.query());

  if (!parsed.success) {
    return c.json(errorBody("VALIDATION_ERROR", "Invalid query parameters."), 400);
  }

  const { q, roast, origin, minPrice, maxPrice, page, pageSize } = parsed.data;

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return c.json(errorBody("VALIDATION_ERROR", "minPrice cannot be greater than maxPrice."), 400);
  }

  const whereClauses: string[] = [];
  const whereParams: Array<string | number> = [];

  if (q) {
    const like = `%${q.toLowerCase()}%`;
    whereClauses.push("(LOWER(name) LIKE ? OR LOWER(origin) LIKE ?)");
    whereParams.push(like, like);
  }

  if (roast) {
    whereClauses.push("LOWER(roast_level) = LOWER(?)");
    whereParams.push(roast);
  }

  if (origin) {
    whereClauses.push("LOWER(origin) = LOWER(?)");
    whereParams.push(origin);
  }

  if (minPrice !== undefined) {
    whereClauses.push("price_cents >= ?");
    whereParams.push(minPrice);
  }

  if (maxPrice !== undefined) {
    whereClauses.push("price_cents <= ?");
    whereParams.push(maxPrice);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const itemsSql = `
    SELECT
      id,
      name,
      origin,
      roast_level,
      price_cents,
      image_url,
      description,
      stock,
      created_at
    FROM products
    ${whereSql}
    ORDER BY created_at DESC, name ASC
    LIMIT ? OFFSET ?
  `;

  const totalSql = `
    SELECT COUNT(*) AS total
    FROM products
    ${whereSql}
  `;

  const itemsStmt = c.env.DB.prepare(itemsSql).bind(...whereParams, pageSize, offset);
  const totalStmt = c.env.DB.prepare(totalSql).bind(...whereParams);

  const [itemsResult, totalRow] = await Promise.all([
    itemsStmt.all<ProductRow>(),
    totalStmt.first<{ total: number | string }>()
  ]);

  return c.json({
    items: itemsResult.results,
    page,
    pageSize,
    total: parseTotalValue(totalRow?.total)
  });
});

app.get("/api/products/:id", async (c) => {
  const { id } = c.req.param();

  const product = await c.env.DB.prepare(
    `
      SELECT
        id,
        name,
        origin,
        roast_level,
        price_cents,
        image_url,
        description,
        stock,
        created_at
      FROM products
      WHERE id = ?
      LIMIT 1
    `
  )
    .bind(id)
    .first<ProductRow>();

  if (!product) {
    return c.json(errorBody("NOT_FOUND", "Product not found."), 404);
  }

  return c.json(product);
});

app.route("/api/admin", adminRoutes);
app.route("/api/ai", aiRoutes);

app.notFound((c) => {
  return c.json(errorBody("NOT_FOUND", "Route not found."), 404);
});

export { app };

export default {
  fetch: app.fetch
};
