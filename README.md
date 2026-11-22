# Coffee Website

A full-stack coffee storefront with a React/Vite frontend and a Hono backend for Cloudflare Workers.

## Live URLs

- Frontend: [PLACEHOLDER]
- Backend: [PLACEHOLDER]

## Project Structure

- `frontend/` — React, Vite, and TypeScript
- `backend/` — Hono, Cloudflare Workers, D1, TypeScript, and Vitest
- `backend/migrations/0001_initial_schema.sql` — initial D1 schema
- `backend/seed.sql` — seed data for 15 coffees

## Features

### Frontend

- Catalogue with search, roast, origin, and price filters plus pagination
- Product detail pages with stock-aware Add to cart behavior
- Google sign-in and sign-out through the backend
- Cart quantity changes and removals
- Server-calculated cart totals
- Authenticated checkout with shipping details and Idempotency-Key generation
- Order confirmation and My Orders pages
- Responsive layouts and loading, empty, and error states

### Backend

- Hono API on Cloudflare Workers
- Google OAuth 2.0 / OpenID Connect authorization-code flow with PKCE
- HttpOnly, Secure, SameSite=Lax session cookies
- D1-backed users, products, cart, orders, order items, and sessions
- Server-side order totals and stock checks
- Idempotency protection for order submission
- Standard JSON error shape
- CORS restricted by `FRONTEND_ORIGIN`

## API Endpoints

### Health

- `GET /health`

### Authentication

- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Products

- `GET /api/products`
- `GET /api/products/:id`

Query parameters for `GET /api/products`:

- `q`
- `roast`
- `origin`
- `minPrice`
- `maxPrice`
- `page`
- `pageSize` (maximum 50)

### Cart

- `GET /api/cart` — requires authentication
- `PUT /api/cart/items/:productId` — requires authentication
- `DELETE /api/cart/items/:productId` — requires authentication

### Orders

- `POST /api/orders` — requires authentication and `Idempotency-Key`
- `GET /api/orders` — requires authentication
- `GET /api/orders/:id` — requires authentication and order ownership

## Frontend Routes

- `/` — catalogue
- `/products/:id` — product detail
- `/cart` — cart
- `/checkout` — checkout
- `/orders` — My Orders
- `/orders/:id` — order detail
- `/orders/:id/confirmation` — order confirmation

## Environment Variables

Copy [`.env.example`](.env.example) as a starting point.

Backend variables:

- `FRONTEND_ORIGIN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `ADMIN_EMAILS`

Frontend variable:

- `VITE_API_URL`

The frontend API client uses `VITE_API_URL` as its base URL and sets `credentials: "include"` on API requests.

## Backend Setup

```powershell
cd backend
npm install
npm run db:setup:local
npm run dev
```

Configure the real D1 database name and ID in `backend/wrangler.toml` before remote deployment.

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

Set `VITE_API_URL` in `frontend/.env` or the frontend deployment environment before starting or building.

## Backend Scripts

- `npm run dev` — start Wrangler locally
- `npm run deploy` — deploy the Worker
- `npm run lint` — run ESLint
- `npm run format` — format files with Prettier
- `npm run typecheck` — run TypeScript checking
- `npm test` — run Vitest once
- `npm run test:watch` — run Vitest in watch mode
- `npm run db:migrate:local` — apply migrations to local D1
- `npm run db:migrate:remote` — apply migrations to remote D1
- `npm run db:seed:local` — seed local D1
- `npm run db:seed:remote` — seed remote D1
- `npm run db:setup:local` — migrate then seed local D1
- `npm run db:setup:remote` — migrate then seed remote D1

## Frontend Scripts

- `npm run dev` — start Vite
- `npm run build` — typecheck and produce the production build
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint
- `npm run format` — format files with Prettier
- `npm run typecheck` — run TypeScript checking

## Tests

Run from `backend/`:

```powershell
npm test
```

The Vitest suite covers:

- Health endpoint
- Product filtering and pagination
- Product detail 404 behavior
- Cart line and cart total calculations
- Quantity change and empty cart totals
- Order total calculation
- Insufficient stock rollback and 409 behavior
- Idempotency with a repeated key
- Tampered request prices ignored in favor of database prices
- Anonymous and normal-user admin authorization middleware behavior

## Database Migration

Apply and seed local D1:

```powershell
cd backend
npm run db:setup:local
```

Apply and seed remote D1:

```powershell
cd backend
npm run db:setup:remote
```

## Known Issues

- The repository is not currently initialized as a Git repository, so no history-based secret scan has been run.
- Admin route modules and their `/api/admin/*` mounts are not present in the backend.
- AI route modules and `/api/ai/coffee-finder` are not implemented in the backend.
- Live frontend and backend deployment URLs are not provided.
- `backend/wrangler.toml` contains D1 name and ID placeholders that must be replaced for deployment.
- No CI/CD deployment workflow file is currently present.

## What I Would Do With More Time

- Add real admin product and order route modules with server-side validation.
- Implement and test the AI Coffee Finder endpoint, including input limits, database-verified products, fallback behavior, and rate limiting.
- Initialize Git and run secret scans on both the working tree and full history.
- Add a real README environment/Cloudflare setup guide and deployment runbook.
- Expand API tests to cover every endpoint and middleware branch.
- Add frontend component tests and end-to-end checkout/auth tests.
