# Copilot Instructions: Coffee E-Commerce

Save this file as `.github/copilot-instructions.md` in the repo root.

## Project
Full-stack coffee store. Separate apps: `/frontend` and `/backend`, talking over a REST JSON API. Everything runs on Cloudflare.

## Stack
- Frontend: React + Vite + TypeScript (React Router, plain fetch with a small API client)
- Backend: Hono on Cloudflare Workers, TypeScript
- Database: Cloudflare D1 (SQLite), schema only through migrations in `/backend/migrations`
- Validation: zod on every request body, query and param
- Tests: Vitest
- Lint/format: ESLint + Prettier
- AI: Cloudflare Workers AI (backend only)

## Hard rules (never break these)
1. **Never trust the client for money.** Prices, totals and stock are read from the DB on the server. Ignore any price sent by the browser.
2. **Authorization on the server.** Every admin route checks the admin role in middleware. Hiding buttons in the UI is not security.
3. **Stock can never go negative.** Decrement with `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?` and check `meta.changes`. Reject the order if any row fails.
4. **Orders are atomic and idempotent.** Use `db.batch()` (D1 has no manual transactions). The client sends an `Idempotency-Key`; a repeated key returns the existing order, never a new one.
5. **No secrets in code or git.** Read from `c.env`. Every variable is listed in `.env.example` (names only). Local values go in `.dev.vars` (gitignored).
6. **Sessions** are stored in HttpOnly, Secure, SameSite cookies. No tokens in localStorage.
7. **CORS** allows only the frontend origin from an env var. No wildcard.
8. **Validate all input** with zod. On failure, return 400.
9. **AI keys and calls stay on the backend.** AI results must come from real catalogue rows only. Cap input length, rate-limit, and fall back gracefully if AI fails.

## API conventions
- Consistent error shape: `{ "error": { "code": "STRING", "message": "Human readable" } }`
- Correct status codes: 400 validation, 401 not signed in, 403 forbidden, 404 not found, 409 conflict (e.g. out of stock), 429 rate limited, 500 unexpected
- Never return stack traces. Log the real error with `console.error`, return a generic message.
- List endpoints are paginated: `?page=1&pageSize=12`
- Money is stored as integer paise/cents, never floats.
- `GET /health` returns `{ "status": "ok" }`

## Code style
- TypeScript strict mode, no `any`.
- Small functions. Put core logic (cart totals, stock updates, order creation) in pure/testable functions separate from route handlers.
- Folder layout in the backend: `src/routes`, `src/services`, `src/middleware`, `src/db`, `src/lib`.
- No commented-out code, no dead code, no leftover `console.log`.
- Frontend: handle loading, empty and error states on every data-driven page. Semantic HTML, `alt` on images, labelled form inputs, keyboard-friendly.

## Testing
- Unit tests for cart totals, stock decrement, order creation, idempotency.
- A few API tests for auth, admin 403, and rejected tampered prices.

## Workflow
- Make one small change at a time. Explain what changed and why in plain language.
- Prefer boring, well-known solutions over clever ones. I must be able to explain every line.
- When unsure about a requirement, ask instead of guessing.
