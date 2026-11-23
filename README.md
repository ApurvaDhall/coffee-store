# Roast Republic Coffee Store

Roast Republic is a full-stack coffee storefront built with React and Hono. It supports Google sign-in, a server-side cart and checkout, idempotent orders, admin product and order management, and an AI-assisted Coffee Finder.

## Live application

- Site: https://coffee-frontend-2if.pages.dev
- API: https://coffee-backend.apurvadhall.workers.dev
- Health: https://coffee-backend.apurvadhall.workers.dev/health
- Repository: https://github.com/ApurvaDhall/coffee-store

## Overview

Customers can browse and filter the catalogue, open product details, manage a cart, sign in with Google, checkout, and review their orders. Anyone can use the Coffee Finder, which asks Workers AI for catalog-backed matches and falls back to local keyword matches if AI is unavailable.

Administrators can manage products and order statuses after their Google email is included in `ADMIN_EMAILS`.

## Architecture

```text
Browser
  -> Cloudflare Pages React/Vite frontend
  -> Pages Function proxy: /api/* -> Hono Worker
  -> Hono Worker: Google OAuth, catalogue, cart, orders, admin, AI
  -> Cloudflare D1
  -> Workers AI
```

The frontend Pages Function proxies `/api/*` to `https://coffee-backend.apurvadhall.workers.dev`. Keeping API calls same-origin allows the browser to send the HttpOnly session cookie through the frontend, avoiding a cross-site cookie setup.

The Hono Worker is the authority for authentication, cart totals, order totals, stock checks, idempotency, and database access.

## Tech stack and reasons

- React 18 and React Router 6: interactive storefront pages and client-side routing.
- Vite and TypeScript: fast frontend builds and static type checking.
- Cloudflare Pages and a Pages Function: static hosting plus same-origin API proxying.
- Hono: small, typed HTTP routing for Cloudflare Workers.
- Cloudflare D1: serverless SQLite storage for users, products, carts, orders, sessions, and rate limits.
- Workers AI: text-generation-backed Coffee Finder recommendations.
- Zod: request and AI-response validation.
- jose: Google OpenID Connect ID-token verification.
- Vitest: backend unit and route tests.
- GitHub Actions: pull-request checks and deployment automation.

## Local setup

Requirements:

- Node.js 20
- npm
- A Google OAuth app
- A Cloudflare account with D1 access for remote deployment

Install and run the backend:

```powershell
cd backend
npm ci
npm run db:setup:local
npm run dev
```

The local Worker defaults to `http://localhost:8787`.

Install and run the frontend in another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Copy `.env.example` files only as templates. Never add real credentials to `.env`, `.dev.vars`, or the README.

## Environment variables

Application variables:

| Name | Purpose |
| --- | --- |
| `FRONTEND_ORIGIN` | Allowed frontend origin and OAuth redirect origin in the Worker |
| `OAUTH_REDIRECT_URI` | Optional explicit Google OAuth callback URL |
| `GOOGLE_CLIENT_ID` | Google OAuth application client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth application client secret |
| `SESSION_SECRET` | Session/signing configuration for the application |
| `ADMIN_EMAILS` | Comma-separated Google emails allowed to use `/api/admin/*` |
| `VITE_API_URL` | Optional frontend API base URL; production uses same-origin requests |

The binding names `DB` and `AI` are configured in `backend/wrangler.toml`; they are Cloudflare bindings, not environment variables.

### Admin reviewer access

Admin access is determined by `ADMIN_EMAILS` in `backend/wrangler.toml`. A reviewer must:

1. Have their Google email added to `ADMIN_EMAILS`.
2. Be added to the Google OAuth app's Test users because the app is in Testing mode.

Reviewer Google email: please email it to me and I will add it to ADMIN_EMAILS and the OAuth test users.

Alternatively, ask the repository owner to add the reviewer email.

### OAuth testing mode

The Google OAuth app is in Testing mode. Only Google accounts explicitly added as Test users can sign in.

## Scripts

Backend scripts:

- `npm run dev` - start the local Worker
- `npm run deploy` - deploy the Worker
- `npm run lint` - run ESLint
- `npm run format` - format files with Prettier
- `npm run typecheck` - run TypeScript without emitting
- `npm test` - run the Vitest suite once
- `npm run test:watch` - run Vitest in watch mode
- `npm run db:migrate:local` - apply D1 migrations locally
- `npm run db:migrate:remote` - apply D1 migrations remotely
- `npm run db:seed:local` - seed local D1
- `npm run db:seed:remote` - seed remote D1
- `npm run db:setup:local` - migrate then seed local D1
- `npm run db:setup:remote` - migrate then seed remote D1

Frontend scripts:

- `npm run dev` - start Vite
- `npm run build` - type-check and create the production build
- `npm run preview` - preview the production build
- `npm run lint` - run ESLint
- `npm run format` - format files with Prettier
- `npm run typecheck` - run TypeScript without emitting

## How to run tests

Backend:

```powershell
cd backend
npm run lint
npx tsc --noEmit
npm test
```

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

The frontend has no automated test suite. Backend Vitest coverage includes health, products, cart calculations, order totals and rollback behavior, tampered prices, idempotency, admin authorization, and AI Coffee Finder response handling.

## CI/CD

GitHub Actions runs for pull requests and pushes to `main`:

1. Install backend and frontend dependencies with `npm ci`.
2. Run lint in both folders.
3. Run backend TypeScript checking.
4. Run backend Vitest tests.
5. Build the frontend.
6. On a push to `main`, and only after all checks pass, apply remote D1 migrations and deploy the Worker.
7. Build and deploy the frontend to the Cloudflare Pages project `coffee-frontend`.

Pull requests do not deploy either application.

## API endpoint list

### Health

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/health` | Public |

### Authentication

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/auth/google` | Starts Google OAuth |
| `GET` | `/api/auth/google/callback` | OAuth callback |
| `GET` | `/api/auth/me` | Signed-in user |
| `POST` | `/api/auth/logout` | Signed-in user |

### Products

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/products` | Public |
| `GET` | `/api/products/:id` | Public |

`GET /api/products` accepts `q`, `roast`, `origin`, `minPrice`, `maxPrice`, `page`, and `pageSize` (maximum 50).

### Cart

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/cart` | Signed-in user |
| `PUT` | `/api/cart/items/:productId` | Signed-in user |
| `DELETE` | `/api/cart/items/:productId` | Signed-in user |

### Orders

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/api/orders` | Signed-in user; requires `Idempotency-Key` |
| `GET` | `/api/orders` | Signed-in user |
| `GET` | `/api/orders/:id` | Signed-in user and order owner |

### Admin

Every `/api/admin/*` route is behind `requireAuth` and `requireAdmin`.

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/admin/products` | Admin |
| `POST` | `/api/admin/products` | Admin |
| `PATCH` | `/api/admin/products/:id` | Admin |
| `GET` | `/api/admin/orders` | Admin |
| `PATCH` | `/api/admin/orders/:id/status` | Admin |

### AI Coffee Finder

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/api/ai/coffee-finder` | Public, limited to 10 requests per minute per process window |

The request body is `{ "query": "..." }`; the server accepts 1-300 characters.

## AI feature and limits

Coffee Finder sends a catalog snapshot and the user query to Workers AI using `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Returned product IDs are validated and cross-checked against D1 before any product is returned. The AI response supports both `response` and OpenAI-style `choices[0].message.content` shapes and tolerates fenced or surrounding text around JSON.

The endpoint has a fixed 8-second timeout and a D1-backed 10-request-per-minute rate-limit row per window. Recommendations are limited to three catalog items. If AI fails, times out, or returns invalid or unknown IDs, the endpoint returns the first three available catalog products as keyword/fallback inventory matches.

## Assumptions and trade-offs

- Google is the only supported sign-in provider.
- The payment flow is mocked: no real payment provider charges or settlement is performed.
- Stock is checked and decremented as part of order creation; database constraints keep stock from becoming negative.
- Order total and product snapshots are based on database prices, not client-provided prices.
- The Idempotency-Key prevents duplicate orders for the same user and key.
- The D1 rate limit is simple and may not be a distributed global limiter in every deployment scenario.
- The catalog fallback is intentionally conservative: only database products are exposed.
- Test orders exist in the live database.

## Known issues

- Payment is mocked.
- Git history was set up late, so commits are grouped by feature.
- `npm audit` reports dependency vulnerabilities that were not fixed.
- Wrangler is on v3 and is not upgraded.
- No end-to-end tests exist.
- The frontend has no automated test suite.
- Test orders exist in the live database.
- The Google OAuth app is in Testing mode and only Test users can sign in.
- Google sign-in fails in Firefox with an INVALID_OAUTH_STATE error in my tests; it works in Chrome. Not fixed due to time. Please use Chrome or Edge.

## Secret-scanning checklist

Before a public release or code review, scan the working tree and history for credentials:

```powershell
# From the repository root
npx gitleaks detect --source . --no-git
npx gitleaks detect --source . --log-opts="--all"
```

The second command scans Git history. Gitleaks is not currently a repository dependency; install or run it through the project/environment's approved tooling.

Do not commit `.dev.vars`, real `.env` files, private keys, OAuth secrets, session secrets, or Cloudflare API tokens.

## What I would do with more time

- Add Playwright end-to-end tests.
- Create a staging environment.
- Add pull-request preview deployments.
- Integrate Stripe Test mode.
- Add order confirmation emails.
- Add image upload and hosted-image management.
- Improve distributed rate limiting.
- Upgrade Wrangler to v4.
