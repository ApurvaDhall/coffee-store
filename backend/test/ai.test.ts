import { describe, expect, it } from "vitest";
import { aiRoutes } from "../src/routes/ai";

function createAiDb(): D1Database {
  const products = [
    {
      id: "prod_brazil_cerrado",
      name: "Brazil Cerrado",
      origin: "Brazil",
      roast_level: "medium",
      price_cents: 1400,
      image_url: "",
      description: "Chocolate and nutty",
      stock: 10,
      created_at: "2026-01-01T00:00:00Z"
    }
  ];

  return {
    prepare(sql: string) {
      return {
        bind() {
          return this;
        },
        async first<T>() {
          if (sql.includes("FROM ai_rate_limits")) {
            return null;
          }
          return null as T;
        },
        async all<T>() {
          if (sql.includes("FROM products")) {
            return { results: products as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          return { meta: { changes: 1 } };
        },
        raw() {
          throw new Error("Not implemented");
        }
      } as unknown as D1PreparedStatement;
    },
    batch() {
      throw new Error("Not implemented");
    },
    exec() {
      throw new Error("Not implemented");
    },
    dump() {
      throw new Error("Not implemented");
    }
  } as unknown as D1Database;
}

describe("POST /api/ai/coffee-finder", () => {
  it("parses a wrapped choices response, coerces numeric ids, and supplies a missing reason", async () => {
    const fakeAi = {
      run: async () => ({
        choices: [
          {
            message: {
              content: 'Here is the result:\n```json\n{"items":[{"id":101}]}\n```'
            }
          }
        ]
      })
    } as unknown as Ai;

    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return this;
          },
          async first<T>() {
            if (sql.includes("FROM ai_rate_limits")) {
              return null;
            }
            return null as T;
          },
          async all<T>() {
            if (sql.includes("FROM products")) {
              return {
                results: [{
                  id: "101",
                  name: "Brazil Cerrado",
                  origin: "Brazil",
                  roast_level: "medium",
                  price_cents: 1400,
                  image_url: "",
                  description: "Chocolate and nutty",
                  stock: 10,
                  created_at: "2026-01-01T00:00:00Z"
                }] as T[]
              };
            }
            return { results: [] as T[] };
          },
          async run() {
            return { meta: { changes: 1 } };
          },
          raw() {
            throw new Error("Not implemented");
          }
        } as unknown as D1PreparedStatement;
      },
      batch() {
        throw new Error("Not implemented");
      },
      exec() {
        throw new Error("Not implemented");
      },
      dump() {
        throw new Error("Not implemented");
      }
    } as unknown as D1Database;

    const response = await aiRoutes.request(
      "/coffee-finder",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "chocolatey low acidity" })
      },
      {
        DB: db,
        AI: fakeAi,
        FRONTEND_ORIGIN: "https://frontend.example.com",
        GOOGLE_CLIENT_ID: "test",
        GOOGLE_CLIENT_SECRET: "test",
        SESSION_SECRET: "test",
        ADMIN_EMAILS: "admin@example.com"
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json<{
      source: string;
      items: Array<{ product: { id: string }; reason: string }>;
    }>();
    expect(body.source).toBe("ai");
    expect(body.items[0]?.product.id).toBe("101");
    expect(body.items[0]?.reason).toBe("Recommended for your search: Brazil Cerrado.");
  });

  it("filters fake AI product ids out of the response", async () => {
    const fakeAi = {
      run: async () => ({
        response: JSON.stringify({
          items: [
            { id: "prod_fake_123", reason: "This ID is not in the database" },
            { id: "prod_brazil_cerrado", reason: "A real Brazilian coffee" }
          ]
        })
      })
    } as unknown as Ai;

    const response = await aiRoutes.request(
      "/coffee-finder",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "nutty chocolate coffee" })
      },
      {
        DB: createAiDb(),
        AI: fakeAi,
        FRONTEND_ORIGIN: "https://frontend.example.com",
        GOOGLE_CLIENT_ID: "test",
        GOOGLE_CLIENT_SECRET: "test",
        SESSION_SECRET: "test",
        ADMIN_EMAILS: "admin@example.com"
      }
    );

    expect(response.status).toBe(200);
    const body = await response.json<{ source: string; items: Array<{ product: { id: string } }> }>();

    expect(body.source).toBe("ai");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.product.id).toBe("prod_brazil_cerrado");
  });
});
