import { describe, expect, it } from "vitest";
import { app } from "../src/index";

type MockUser = {
  id: string;
  google_sub: string;
  email: string;
  name: string;
};

type MockSession = {
  id: string;
  user_id: string;
  expires_at: string;
};

type MockProduct = {
  id: string;
  name: string;
  price_cents: number;
  stock: number;
};

type MockCartItem = {
  user_id: string;
  product_id: string;
  quantity: number;
};

type MockOrder = {
  id: string;
  user_id: string;
  idempotency_key: string;
  total_cents: number;
  status: string;
  shipping_name: string;
  shipping_address: string;
  created_at: string;
};

type MockOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  name_snapshot: string;
  price_cents_snapshot: number;
  quantity: number;
};

type MockState = {
  users: MockUser[];
  sessions: MockSession[];
  products: MockProduct[];
  cart_items: MockCartItem[];
  orders: MockOrder[];
  order_items: MockOrderItem[];
};

function cloneState(state: MockState): MockState {
  return {
    users: state.users.map((v) => ({ ...v })),
    sessions: state.sessions.map((v) => ({ ...v })),
    products: state.products.map((v) => ({ ...v })),
    cart_items: state.cart_items.map((v) => ({ ...v })),
    orders: state.orders.map((v) => ({ ...v })),
    order_items: state.order_items.map((v) => ({ ...v }))
  };
}

function createMockDB(initial: MockState): { db: D1Database; state: MockState } {
  let state = cloneState(initial);
  let txState: MockState | null = null;

  const activeState = () => txState ?? state;

  function createPrepared(sql: string): D1PreparedStatement {
    let params: unknown[] = [];

    const statement = {
      __sql: sql,
      __params: params,
      bind(...args: unknown[]) {
        params = args;
        this.__params = args;
        return this;
      },
      async first<T>() {
        const s = activeState();

        if (sql.includes("FROM sessions s") && sql.includes("INNER JOIN users u")) {
          const sessionId = String(params[0] ?? "");
          const session = s.sessions.find((item) => item.id === sessionId);
          if (!session) {
            return null;
          }
          const user = s.users.find((item) => item.id === session.user_id);
          if (!user) {
            return null;
          }

          return {
            id: user.id,
            google_sub: user.google_sub,
            email: user.email,
            name: user.name,
            expires_at: session.expires_at
          } as T;
        }

        if (sql.includes("SELECT id FROM orders WHERE user_id = ? AND idempotency_key = ?")) {
          const userId = String(params[0] ?? "");
          const key = String(params[1] ?? "");
          const order = s.orders.find((item) => item.user_id === userId && item.idempotency_key === key);
          return order ? ({ id: order.id } as T) : null;
        }

        if (sql.includes("FROM orders") && sql.includes("WHERE id = ? AND user_id = ?")) {
          const orderId = String(params[0] ?? "");
          const userId = String(params[1] ?? "");
          const order = s.orders.find((item) => item.id === orderId && item.user_id === userId);
          return (order ?? null) as T | null;
        }

        return null;
      },
      async all<T>() {
        const s = activeState();

        if (sql.includes("FROM cart_items ci") && sql.includes("INNER JOIN products p")) {
          const userId = String(params[0] ?? "");
          const rows = s.cart_items
            .filter((item) => item.user_id === userId)
            .map((item) => {
              const product = s.products.find((p) => p.id === item.product_id);
              if (!product) {
                return null;
              }
              return {
                product_id: item.product_id,
                quantity: item.quantity,
                name: product.name,
                price_cents: product.price_cents,
                origin: "",
                roast_level: "",
                image_url: null,
                description: null,
                stock: product.stock
              };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null);

          return { results: rows as T[] };
        }

        if (sql.includes("FROM order_items") && sql.includes("WHERE order_id = ?")) {
          const orderId = String(params[0] ?? "");
          const rows = s.order_items.filter((item) => item.order_id === orderId);
          return { results: rows as T[] };
        }

        if (sql.includes("FROM orders") && sql.includes("WHERE user_id = ?")) {
          const userId = String(params[0] ?? "");
          const rows = s.orders.filter((item) => item.user_id === userId);
          return { results: rows as T[] };
        }

        return { results: [] as T[] };
      },
      async run() {
        const s = activeState();

        if (sql.includes("DELETE FROM sessions WHERE id = ?")) {
          const sessionId = String(params[0] ?? "");
          const before = s.sessions.length;
          s.sessions = s.sessions.filter((item) => item.id !== sessionId);
          return { meta: { changes: before - s.sessions.length } } as D1Result;
        }

        if (sql.includes("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?")) {
          const userId = String(params[0] ?? "");
          const productId = String(params[1] ?? "");
          const before = s.cart_items.length;
          s.cart_items = s.cart_items.filter(
            (item) => !(item.user_id === userId && item.product_id === productId)
          );
          return { meta: { changes: before - s.cart_items.length } } as D1Result;
        }

        if (sql.includes("DELETE FROM cart_items WHERE user_id = ?")) {
          const userId = String(params[0] ?? "");
          const before = s.cart_items.length;
          s.cart_items = s.cart_items.filter((item) => item.user_id !== userId);
          return { meta: { changes: before - s.cart_items.length } } as D1Result;
        }

        return { meta: { changes: 0 } } as D1Result;
      },
      raw() {
        throw new Error("Not implemented");
      }
    };

    return statement as unknown as D1PreparedStatement;
  }

  const db = {
    prepare(sql: string) {
      return createPrepared(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results: D1Result[] = [];

      for (const statement of statements) {
        const stmt = statement as unknown as { __sql?: string; __params?: unknown[] };
        const sql = stmt.__sql ?? "";
        const params = stmt.__params ?? [];
        const s = activeState();

        if (sql.includes("BEGIN IMMEDIATE")) {
          txState = cloneState(state);
          results.push({ meta: { changes: 0 } } as D1Result);
          continue;
        }

        if (sql.includes("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?")) {
          const qty = Number(params[0] ?? 0);
          const productId = String(params[1] ?? "");
          const minStock = Number(params[2] ?? 0);
          const product = s.products.find((item) => item.id === productId);

          if (!product || product.stock < minStock) {
            results.push({ meta: { changes: 0 } } as D1Result);
            continue;
          }

          product.stock -= qty;
          results.push({ meta: { changes: 1 } } as D1Result);
          continue;
        }

        if (sql.includes("INSERT INTO orders")) {
          const [id, userId, key, total, status, shippingName, shippingAddress] = params as [
            string,
            string,
            string,
            number,
            string,
            string,
            string
          ];

          s.orders.push({
            id,
            user_id: userId,
            idempotency_key: key,
            total_cents: total,
            status,
            shipping_name: shippingName,
            shipping_address: shippingAddress,
            created_at: "2026-11-20T00:00:00.000Z"
          });

          results.push({ meta: { changes: 1 } } as D1Result);
          continue;
        }

        if (sql.includes("INSERT INTO order_items")) {
          const [id, orderId, productId, nameSnapshot, priceSnapshot, quantity] = params as [
            string,
            string,
            string,
            string,
            number,
            number
          ];

          s.order_items.push({
            id,
            order_id: orderId,
            product_id: productId,
            name_snapshot: nameSnapshot,
            price_cents_snapshot: priceSnapshot,
            quantity
          });

          results.push({ meta: { changes: 1 } } as D1Result);
          continue;
        }

        if (sql.includes("DELETE FROM cart_items WHERE user_id = ?")) {
          const userId = String(params[0] ?? "");
          const before = s.cart_items.length;
          s.cart_items = s.cart_items.filter((item) => item.user_id !== userId);
          results.push({ meta: { changes: before - s.cart_items.length } } as D1Result);
          continue;
        }

        results.push({ meta: { changes: 0 } } as D1Result);
      }

      return results;
    },
    async exec(query: string) {
      if (query.includes("COMMIT")) {
        if (txState) {
          state = txState;
          txState = null;
        }
        return;
      }

      if (query.includes("ROLLBACK")) {
        txState = null;
      }
    },
    dump() {
      throw new Error("Not implemented");
    },
    withSession() {
      throw new Error("Not implemented");
    }
  } as unknown as D1Database;

  return {
    db,
    get state() {
      return state;
    }
  };
}

function baseEnv(db: D1Database) {
  return {
    DB: db,
    AI: {} as Ai,
    FRONTEND_ORIGIN: "https://frontend.example.com",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    SESSION_SECRET: "test-secret",
    ADMIN_EMAILS: ""
  };
}

describe("POST /api/orders", () => {
  it("rejects order when stock update affects 0 rows and persists nothing", async () => {
    const mock = createMockDB({
      users: [
        {
          id: "u1",
          google_sub: "sub1",
          email: "user@example.com",
          name: "User"
        }
      ],
      sessions: [
        {
          id: "sess_1",
          user_id: "u1",
          expires_at: "2099-01-01T00:00:00.000Z"
        }
      ],
      products: [
        {
          id: "p1",
          name: "Kenya AA",
          price_cents: 1800,
          stock: 1
        }
      ],
      cart_items: [
        {
          user_id: "u1",
          product_id: "p1",
          quantity: 2
        }
      ],
      orders: [],
      order_items: []
    });

    const response = await app.request(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "stock-fail-1",
          Cookie: "session=sess_1"
        },
        body: JSON.stringify({
          shippingName: "Jane Doe",
          shippingAddress: "123 Coffee St"
        })
      },
      baseEnv(mock.db)
    );

    expect(response.status).toBe(409);
    expect(mock.state.orders).toHaveLength(0);
    expect(mock.state.order_items).toHaveLength(0);
    expect(mock.state.cart_items).toHaveLength(1);
    expect(mock.state.products[0]?.stock).toBe(1);
  });

  it("returns existing order for duplicate idempotency key without creating a second order", async () => {
    const mock = createMockDB({
      users: [
        {
          id: "u1",
          google_sub: "sub1",
          email: "user@example.com",
          name: "User"
        }
      ],
      sessions: [
        {
          id: "sess_1",
          user_id: "u1",
          expires_at: "2099-01-01T00:00:00.000Z"
        }
      ],
      products: [
        {
          id: "p1",
          name: "Kenya AA",
          price_cents: 1800,
          stock: 10
        }
      ],
      cart_items: [
        {
          user_id: "u1",
          product_id: "p1",
          quantity: 2
        }
      ],
      orders: [],
      order_items: []
    });

    const requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "idem-123",
        Cookie: "session=sess_1"
      },
      body: JSON.stringify({
        shippingName: "Jane Doe",
        shippingAddress: "123 Coffee St"
      })
    } as const;

    const first = await app.request("/api/orders", requestInit, baseEnv(mock.db));
    const firstBody = await first.json<{ id: string }>();

    expect(first.status).toBe(201);
    expect(mock.state.orders).toHaveLength(1);

    const second = await app.request("/api/orders", requestInit, baseEnv(mock.db));
    const secondBody = await second.json<{ id: string }>();

    expect(second.status).toBe(200);
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody).toEqual(firstBody);
    expect(mock.state.orders).toHaveLength(1);
  });

  it("ignores a tampered price and stores the database price", async () => {
    const mock = createMockDB({
      users: [{ id: "u1", google_sub: "sub1", email: "user@example.com", name: "User" }],
      sessions: [{ id: "sess_1", user_id: "u1", expires_at: "2099-01-01T00:00:00.000Z" }],
      products: [{ id: "p1", name: "Kenya AA", price_cents: 1800, stock: 10 }],
      cart_items: [{ user_id: "u1", product_id: "p1", quantity: 2 }],
      orders: [],
      order_items: []
    });

    const response = await app.request(
      "/api/orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "tampered-price",
          Cookie: "session=sess_1"
        },
        body: JSON.stringify({
          shippingName: "Jane Doe",
          shippingAddress: "123 Coffee St",
          price_cents: 1,
          total_cents: 1
        })
      },
      baseEnv(mock.db)
    );

    expect(response.status).toBe(201);
    expect(mock.state.orders).toHaveLength(1);
    expect(mock.state.orders[0]?.total_cents).toBe(3600);
  });
});
