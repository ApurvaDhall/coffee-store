import { Hono } from "hono";
import { z } from "zod";
import { errorBody } from "../http";
import type { AppBindings, AppVariables } from "../middleware/auth";

const aiModelResponseSchema = z.object({
  items: z.array(z.object({
    id: z.coerce.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(500)
  })).max(3)
});

export const aiRoutes = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

aiRoutes.post("/coffee-finder", async (c) => {
  const body = await c.req.json().catch(() => null);
  const querySchema = z.object({ query: z.string().trim().min(1).max(300) });
  const parsed = querySchema.safeParse(body);

  if (!parsed.success) {
    return c.json(errorBody("VALIDATION_ERROR", "query must be between 1 and 300 characters."), 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const windowSeconds = 60;
  const limit = 10;
  const windowStart = now - (now % windowSeconds);
  const key = `coffee-finder:${windowStart}`;

  const rateRow = await c.env.DB.prepare(
    "SELECT request_count FROM ai_rate_limits WHERE key = ?"
  ).bind(key).first<{ request_count: number }>();

  const requestCount = rateRow?.request_count ?? 0;
  if (requestCount >= limit) {
    return c.json(errorBody("RATE_LIMITED", "Try again in a minute."), 429);
  }

  await c.env.DB.prepare(
    `INSERT INTO ai_rate_limits (key, window_start, request_count)
     VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET request_count = ai_rate_limits.request_count + 1`
  ).bind(key, windowStart).run();

  const products = await c.env.DB.prepare(
    `SELECT id, name, origin, roast_level, price_cents, image_url, description, stock, created_at
     FROM products
     LIMIT 100`
  ).all<{
    id: string;
    name: string;
    origin: string;
    roast_level: string;
    price_cents: number;
    image_url: string | null;
    description: string | null;
    stock: number;
    created_at: string;
  }>();

  const fallbackItems = products.results.slice(0, 3).map((product) => ({
    product,
    reason: `Matches your search from available coffee inventory: ${product.name}.`
  }));

  try {
    const ai = c.env.AI;
    if (!ai) {
      return c.json({ source: "fallback", items: fallbackItems });
    }

    const productCatalog = products.results.map((product) => ({
      id: product.id,
      name: product.name,
      origin: product.origin,
      roast_level: product.roast_level,
      price_cents: product.price_cents,
      description: product.description,
      stock: product.stock
    }));

    const aiResponse = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: "Return a JSON object with an items array. Use only IDs and products from the supplied catalog. Never invent product IDs."
        },
        {
          role: "user",
          content: `Query: ${parsed.data.query}\nCatalog: ${JSON.stringify(productCatalog)}\nReturn up to 3 matches.`
        }
      ],
      response_format: { type: "json_object" }
    }) as { response?: unknown };

    const modelText = typeof aiResponse.response === "string"
      ? aiResponse.response
      : JSON.stringify(aiResponse.response ?? aiResponse);
    const modelParsed = aiModelResponseSchema.safeParse(JSON.parse(modelText));

    if (!modelParsed.success) {
      return c.json({ source: "fallback", items: fallbackItems });
    }

    const seen = new Set<string>();
    const catalogById = new Map(products.results.map((product) => [product.id, product]));
    const verifiedItems = modelParsed.data.items.flatMap((item) => {
      if (seen.has(item.id)) return [];
      const product = catalogById.get(item.id);
      if (!product) return [];
      seen.add(item.id);
      return [{ product, reason: item.reason }];
    }).slice(0, 3);

    if (verifiedItems.length === 0) {
      return c.json({ source: "fallback", items: fallbackItems });
    }

    return c.json({ source: "ai", items: verifiedItems });
  } catch {
    return c.json({ source: "fallback", items: fallbackItems });
  }
});
