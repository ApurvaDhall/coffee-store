import { Hono } from "hono";
import { z } from "zod";
import { errorBody } from "../http";
import {
  requireAdmin,
  requireAuth,
  type AppBindings,
  type AppVariables
} from "../middleware/auth";

const productIdSchema = z.string().trim().min(1).max(100);
const orderIdSchema = z.string().trim().min(1).max(100);

const productInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  origin: z.string().trim().min(1).max(100),
  roast_level: z.enum(["light", "medium", "dark"]),
  price_cents: z.number().int().nonnegative(),
  image_url: z
    .string()
    .trim()
    .refine((value) => value === "" || /^https?:\/\//i.test(value), "Invalid image URL"),
  description: z.string().trim().max(2000),
  stock: z.number().int().nonnegative()
});

const orderStatusSchema = z.enum(["paid", "processing", "shipped", "delivered", "cancelled"]);

export const adminRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

adminRoutes.use("*", requireAuth, requireAdmin);

adminRoutes.get("/products", async (c) => {
  const page = z.coerce.number().int().min(1).default(1).parse(c.req.query("page") ?? "1");
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .parse(c.req.query("pageSize") ?? "20");
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, name, origin, roast_level, price_cents, image_url, description, stock, created_at
       FROM products
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(pageSize, offset).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM products").first<{ total: number }>()
  ]);

  return c.json({ items: items.results, page, pageSize, total: total?.total ?? 0 });
});

adminRoutes.post("/products", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody("VALIDATION_ERROR", "Request body must be valid JSON."), 400);
  }

  const parsed = productInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(errorBody("VALIDATION_ERROR", "Invalid product data."), 400);
  }

  const id = `prod_${crypto.randomUUID()}`;
  const product = parsed.data;

  await c.env.DB.prepare(
    `INSERT INTO products
      (id, name, origin, roast_level, price_cents, image_url, description, stock, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  )
    .bind(
      id,
      product.name,
      product.origin,
      product.roast_level,
      product.price_cents,
      product.image_url,
      product.description,
      product.stock
    )
    .run();

  const created = await c.env.DB.prepare(
    `SELECT id, name, origin, roast_level, price_cents, image_url, description, stock, created_at
     FROM products WHERE id = ?`
  ).bind(id).first();

  return c.json(created, 201);
});

adminRoutes.patch("/products/:id", async (c) => {
  const idParsed = productIdSchema.safeParse(c.req.param("id"));
  if (!idParsed.success) {
    return c.json(errorBody("VALIDATION_ERROR", "Invalid product id."), 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody("VALIDATION_ERROR", "Request body must be valid JSON."), 400);
  }

  const parsed = productInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(errorBody("VALIDATION_ERROR", "Invalid product data."), 400);
  }

  const product = parsed.data;
  const updated = await c.env.DB.prepare(
    `UPDATE products
     SET name = ?, origin = ?, roast_level = ?, price_cents = ?, image_url = ?, description = ?, stock = ?
     WHERE id = ?`
  )
    .bind(
      product.name,
      product.origin,
      product.roast_level,
      product.price_cents,
      product.image_url,
      product.description,
      product.stock,
      idParsed.data
    )
    .run();

  if ((updated.meta.changes ?? 0) === 0) {
    return c.json(errorBody("NOT_FOUND", "Product not found."), 404);
  }

  const result = await c.env.DB.prepare(
    `SELECT id, name, origin, roast_level, price_cents, image_url, description, stock, created_at
     FROM products WHERE id = ?`
  ).bind(idParsed.data).first();

  return c.json(result);
});

adminRoutes.get("/orders", async (c) => {
  const page = z.coerce.number().int().min(1).default(1).parse(c.req.query("page") ?? "1");
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .parse(c.req.query("pageSize") ?? "20");
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, user_id, idempotency_key, total_cents, status, shipping_name, shipping_address, created_at
       FROM orders
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(pageSize, offset).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS total FROM orders").first<{ total: number }>()
  ]);

  return c.json({ items: items.results, page, pageSize, total: total?.total ?? 0 });
});

adminRoutes.patch("/orders/:id/status", async (c) => {
  const idParsed = orderIdSchema.safeParse(c.req.param("id"));
  if (!idParsed.success) {
    return c.json(errorBody("VALIDATION_ERROR", "Invalid order id."), 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(errorBody("VALIDATION_ERROR", "Request body must be valid JSON."), 400);
  }

  const parsed = z.object({ status: orderStatusSchema }).safeParse(body);
  if (!parsed.success) {
    return c.json(errorBody("VALIDATION_ERROR", "Invalid order status."), 400);
  }

  const updated = await c.env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?")
    .bind(parsed.data.status, idParsed.data)
    .run();

  if ((updated.meta.changes ?? 0) === 0) {
    return c.json(errorBody("NOT_FOUND", "Order not found."), 404);
  }

  return c.json({ id: idParsed.data, status: parsed.data.status });
});
