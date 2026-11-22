import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  requireAdmin,
  type AppBindings,
  type AppVariables
} from "../src/middleware/auth";

function createAdminDb(normalUser: boolean): D1Database {
  return {
    prepare(sql: string) {
      let sessionId = "";

      return {
        bind(value: unknown) {
          sessionId = String(value);
          return this;
        },
        async first<T>() {
          if (sql.includes("FROM sessions s") && sessionId === "normal-session") {
            return {
              id: "normal-user",
              google_sub: "normal-sub",
              email: normalUser ? "user@example.com" : "admin@example.com",
              name: "Test User",
              expires_at: "2099-01-01T00:00:00.000Z"
            } as T;
          }
          return null;
        },
        async run() {
          return { meta: { changes: 0 } };
        },
        async all() {
          return { results: [] };
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
    },
    withSession() {
      throw new Error("Not implemented");
    }
  } as unknown as D1Database;
}

function createTestApp(db: D1Database, adminEmails: string) {
  const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

  app.get("/api/admin/products", requireAdmin, (c) => c.json({ ok: true }));

  return app.request("/api/admin/products", undefined, {
    DB: db,
    FRONTEND_ORIGIN: "https://frontend.example.com",
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    SESSION_SECRET: "test",
    ADMIN_EMAILS: adminEmails
  });
}

describe("requireAdmin", () => {
  it("returns 401 for anonymous caller", async () => {
    const response = await createTestApp(createAdminDb(true), "admin@example.com");
    expect(response.status).toBe(401);
  });

  it("returns 403 for normal signed-in user", async () => {
    const db = createAdminDb(true);
    const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();
    app.get("/api/admin/products", requireAdmin, (c) => c.json({ ok: true }));

    const response = await app.request(
      "/api/admin/products",
      { headers: { Cookie: "session=normal-session" } },
      {
        DB: db,
        GOOGLE_CLIENT_ID: "test",
        GOOGLE_CLIENT_SECRET: "test",
        SESSION_SECRET: "test",
        ADMIN_EMAILS: "admin@example.com",
        AI: {} as Ai
      }
    );

    expect(response.status).toBe(403);
  });
});
