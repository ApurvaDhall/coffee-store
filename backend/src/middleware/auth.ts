import { deleteCookie, getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { errorBody } from "../http";

export const SESSION_COOKIE_NAME = "session";

export type AppBindings = {
  DB: D1Database;
  FRONTEND_ORIGIN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ADMIN_EMAILS: string;
  AI: Ai;
};

export type AuthUser = {
  id: string;
  google_sub: string;
  email: string;
  name: string;
};

export type AppVariables = {
  user: AuthUser;
};

type SessionUserRow = AuthUser & {
  expires_at: string;
};

async function findUserBySession(
  c: Context<{ Bindings: AppBindings; Variables: AppVariables }>,
  sessionId: string
): Promise<AuthUser | null> {
  const row = await c.env.DB.prepare(
    `
      SELECT
        u.id,
        u.google_sub,
        u.email,
        u.name,
        s.expires_at
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1
    `
  )
    .bind(sessionId)
    .first<SessionUserRow>();

  if (!row) {
    return null;
  }

  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
    return null;
  }

  return {
    id: row.id,
    google_sub: row.google_sub,
    email: row.email,
    name: row.name
  };
}

export function parseAdminEmails(adminEmailsEnv: string | undefined): Set<string> {
  return new Set(
    (adminEmailsEnv ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0)
  );
}

export async function requireAuth(
  c: Context<{ Bindings: AppBindings; Variables: AppVariables }>,
  next: Next
) {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionId) {
    return c.json(errorBody("UNAUTHORIZED", "Authentication required."), 401);
  }

  const user = await findUserBySession(c, sessionId);
  if (!user) {
    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: "/"
    });
    return c.json(errorBody("UNAUTHORIZED", "Authentication required."), 401);
  }

  c.set("user", user);
  await next();
}

export async function requireAdmin(
  c: Context<{ Bindings: AppBindings; Variables: AppVariables }>,
  next: Next
) {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionId) {
    return c.json(errorBody("UNAUTHORIZED", "Authentication required."), 401);
  }

  const user = await findUserBySession(c, sessionId);
  if (!user) {
    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: "/"
    });
    return c.json(errorBody("UNAUTHORIZED", "Authentication required."), 401);
  }

  const admins = parseAdminEmails(c.env.ADMIN_EMAILS);
  if (!admins.has(user.email.toLowerCase())) {
    return c.json(errorBody("FORBIDDEN", "Admin access required."), 403);
  }

  c.set("user", user);
  await next();
}
