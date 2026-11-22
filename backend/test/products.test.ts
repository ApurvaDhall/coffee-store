import { describe, expect, it } from "vitest";
import { app } from "../src/index";

type Product = {
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

const products: Product[] = [
  {
    id: "p1",
    name: "Ethiopia Yirgacheffe",
    origin: "Ethiopia",
    roast_level: "light",
    price_cents: 1600,
    image_url: null,
    description: null,
    stock: 12,
    created_at: "2026-01-01T10:00:00Z"
  },
  {
    id: "p2",
    name: "Guatemala Antigua",
    origin: "Guatemala",
    roast_level: "medium",
    price_cents: 1700,
    image_url: null,
    description: null,
    stock: 9,
    created_at: "2026-01-02T10:00:00Z"
  },
  {
    id: "p3",
    name: "Sumatra Mandheling",
    origin: "Indonesia",
    roast_level: "dark",
    price_cents: 1800,
    image_url: null,
    description: null,
    stock: 4,
    created_at: "2026-01-03T10:00:00Z"
  },
  {
    id: "p4",
    name: "Kenya AA",
    origin: "Kenya",
    roast_level: "light",
    price_cents: 1900,
    image_url: null,
    description: null,
    stock: 7,
    created_at: "2026-01-04T10:00:00Z"
  },
  {
    id: "p5",
    name: "Brazil Cerrado",
    origin: "Brazil",
    roast_level: "medium",
    price_cents: 1400,
    image_url: null,
    description: null,
    stock: 15,
    created_at: "2026-01-05T10:00:00Z"
  }
];

function filterProducts(sql: string, args: unknown[]): Product[] {
  let cursor = 0;
  let filtered = [...products];

  if (sql.includes("(LOWER(name) LIKE ? OR LOWER(origin) LIKE ?)")) {
    const q1 = String(args[cursor++] ?? "").replaceAll("%", "").toLowerCase();
    const q2 = String(args[cursor++] ?? "").replaceAll("%", "").toLowerCase();
    filtered = filtered.filter(
      (product) =>
        product.name.toLowerCase().includes(q1) || product.origin.toLowerCase().includes(q2)
    );
  }

  if (sql.includes("LOWER(roast_level) = LOWER(?)")) {
    const roast = String(args[cursor++] ?? "").toLowerCase();
    filtered = filtered.filter((product) => product.roast_level.toLowerCase() === roast);
  }

  if (sql.includes("LOWER(origin) = LOWER(?)")) {
    const origin = String(args[cursor++] ?? "").toLowerCase();
    filtered = filtered.filter((product) => product.origin.toLowerCase() === origin);
  }

  if (sql.includes("price_cents >= ?")) {
    const min = Number(args[cursor++] ?? 0);
    filtered = filtered.filter((product) => product.price_cents >= min);
  }

  if (sql.includes("price_cents <= ?")) {
    const max = Number(args[cursor++] ?? Number.MAX_SAFE_INTEGER);
    filtered = filtered.filter((product) => product.price_cents <= max);
  }

  return filtered;
}

function createMockDB(): D1Database {
  return {
    prepare(sql: string) {
      let params: unknown[] = [];

      return {
        bind(...args: unknown[]) {
          params = args;
          return this;
        },
        async first<T>() {
          if (sql.includes("FROM products") && sql.includes("WHERE id = ?")) {
            const id = String(params[0] ?? "");
            const product = products.find((item) => item.id === id);
            return (product ?? null) as T | null;
          }

          if (sql.includes("COUNT(*) AS total")) {
            const filtered = filterProducts(sql, params);
            return { total: filtered.length } as T;
          }

          return null;
        },
        async all<T>() {
          const filtered = filterProducts(sql, params).sort((a, b) => {
            if (a.created_at === b.created_at) {
              return a.name.localeCompare(b.name);
            }
            return a.created_at < b.created_at ? 1 : -1;
          });

          const limit = Number(params[params.length - 2] ?? 20);
          const offset = Number(params[params.length - 1] ?? 0);
          const paged = filtered.slice(offset, offset + limit);

          return {
            results: paged as T[]
          };
        },
        run() {
          throw new Error("Not implemented in test mock");
        },
        raw() {
          throw new Error("Not implemented in test mock");
        }
      } as unknown as D1PreparedStatement;
    },
    batch() {
      throw new Error("Not implemented in test mock");
    },
    exec() {
      throw new Error("Not implemented in test mock");
    },
    dump() {
      throw new Error("Not implemented in test mock");
    }
  } as unknown as D1Database;
}

describe("GET /api/products", () => {
  it("filters by roast and search query", async () => {
    const response = await app.request(
      "/api/products?roast=light&q=ethiopia&page=1&pageSize=10",
      undefined,
      {
        DB: createMockDB(),
        AI: {} as Ai,
        FRONTEND_ORIGIN: "https://frontend.example.com",
        GOOGLE_CLIENT_ID: "test",
        GOOGLE_CLIENT_SECRET: "test",
        SESSION_SECRET: "test",
        ADMIN_EMAILS: ""
      }
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      items: Product[];
      page: number;
      pageSize: number;
      total: number;
    }>();

    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe("p1");
  });

  it("supports pagination and total count", async () => {
    const response = await app.request("/api/products?page=2&pageSize=2", undefined, {
      DB: createMockDB(),
      AI: {} as Ai,
      FRONTEND_ORIGIN: "https://frontend.example.com",
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      SESSION_SECRET: "test",
      ADMIN_EMAILS: ""
    });

    expect(response.status).toBe(200);

    const body = await response.json<{
      items: Product[];
      page: number;
      pageSize: number;
      total: number;
    }>();

    expect(body.total).toBe(5);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
    expect(body.items.map((item) => item.id)).toEqual(["p3", "p2"]);
  });
});

describe("GET /api/products/:id", () => {
  it("returns product by id", async () => {
    const response = await app.request("/api/products/p2", undefined, {
      DB: createMockDB(),
      AI: {} as Ai,
      FRONTEND_ORIGIN: "https://frontend.example.com",
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      SESSION_SECRET: "test",
      ADMIN_EMAILS: ""
    });

    expect(response.status).toBe(200);

    const body = await response.json<Product>();
    expect(body.id).toBe("p2");
  });

  it("returns 404 with standard error shape when missing", async () => {
    const response = await app.request("/api/products/missing", undefined, {
      DB: createMockDB(),
      AI: {} as Ai,
      FRONTEND_ORIGIN: "https://frontend.example.com",
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      SESSION_SECRET: "test",
      ADMIN_EMAILS: ""
    });

    expect(response.status).toBe(404);

    const body = await response.json<{
      error: {
        code: string;
        message: string;
      };
    }>();

    expect(body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Product not found."
      }
    });
  });
});
