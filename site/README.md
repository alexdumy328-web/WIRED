# Norgelis Tech website

React 19 + Vite + Tailwind 4 site for Norgelis Tech (electronics repair, Iași) with 3D exploded views of the devices we repair (three.js via React Three Fiber) and a booking API (Express 5 + MongoDB, file-store fallback).

## Run

```bash
npm install
npm run dev:all      # site on :5173, API on :8787 (Vite proxies /api)
npm run dev          # site only; booking/tracking calls fail politely
npm test             # vitest: hours, slots, estimates
npm run test:server  # node:test: API
npm run build        # type-check + production build into dist/
SERVE_STATIC=1 node server/index.ts   # serve dist/ and the API together
```

Bookings go to MongoDB when `MONGODB_URI` is set (see `server/README.md`), otherwise to `server/.data/bookings.json`.

## Deploy on Vercel (site + API in one project)

1. Import the repo in Vercel and set **Root Directory** to `site`. `vercel.json` sets the build command, so leave the framework preset as "Other".
2. Environment variables (Production and Preview):
   - `MONGODB_URI`: a MongoDB Atlas connection string (the Atlas integration in the Vercel Marketplace sets this for you). In Atlas, allow access from `0.0.0.0/0` or use the Vercel integration, since function IPs change.
   - `MONGODB_DB` (optional, default `norgelis`).
   - `ADMIN_TOKEN`: a long random string. It enables `PATCH /api/bookings/:code/status`.
   - For the iOS app: set `BETTER_AUTH_URL` to the production https origin and use the same address as the app's `NORGELIS_API_BASE_URL`, so sign-in passes the origin check. Optional `DEMO_EMAILS` (see `.env.example`) for the App Review demo account.
   - Accounts: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`, `OWNER_EMAILS`, `DEV_EMAILS` (see `.env.example` and `server/README.md`). Functions run in `fra1`.
3. Deploy. `scripts/vercel-build.mjs` writes `.vercel/output` (Build Output API): the Vite build goes to the CDN, and the Express app is bundled into one Node function at `/api/*`. Other paths fall back to `index.html`.

Without `MONGODB_URI` the API still answers, but bookings go to `/tmp` on the function instance and vanish. That's fine for a preview, not for production.

CLI alternative: `cd site && npx vercel` (first run links the project), then `npx vercel --prod`.

Update a booking's status:

```bash
curl -X PATCH https://<your-domain>/api/bookings/NT-4K7Q/status \
  -H "x-admin-token: $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"status":"ready"}'
```

## Where things live

| Path | What |
|---|---|
| `src/three/` | 3D device viewer and the device models. `contract.ts` is the only interface the page uses. |
| `src/sections/` | Page sections in scroll order (see `src/App.tsx`). |
| `src/i18n/` | `dict.ts` (shape), `ro.ts` (default), `en.ts`. |
| `src/data/catalog.ts` | Price list: jobs, prices in lei, turnaround. |
| `src/data/reviews.ts` | Placeholder reviews. Replace before launch. |
| `server/` | Booking API. `server/vercel.ts` is the Vercel Function entry. |
| `scripts/vercel-build.mjs` | Builds `.vercel/output` for Vercel. |

## Before launch

- Real phone number in `src/sections/Contact.tsx` (`SHOP.phone`) and `src/i18n/*.ts` (`contact.call`).
- Real reviews in `src/data/reviews.ts`, then set `reviewsArePlaceholder = false`.
- Check prices in `src/data/catalog.ts`.
