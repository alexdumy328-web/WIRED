# Booking API

Small Express 5 API behind the repair-shop site: bookings, public status lookup,
slot availability, queue stats and an admin status update.

Runs on Node 24 directly from TypeScript via native type stripping — there is no
build step for the server. Only erasable TypeScript syntax is used (no enums,
namespaces or parameter properties) and relative imports keep their `.ts`
extension.

## Run

```bash
cd site
npm run server        # node --watch server/index.ts, http://localhost:8787
npm run dev:all       # Vite on :5173 + API on :8787 (Vite proxies /api)
npm run test:server   # node:test suite against an in-memory/file store
```

`npm run test:server` uses `node --test 'server/**/*.test.ts'`. Node 24 treats
`--test` arguments as glob patterns, so a bare `server/` directory argument is
not expanded anymore.

## Environment variables

| Variable       | Default    | Meaning                                                                 |
| -------------- | ---------- | ----------------------------------------------------------------------- |
| `PORT`         | `8787`     | HTTP port.                                                              |
| `MONGODB_URI`  | –          | When set, bookings go to MongoDB instead of the JSON file store.        |
| `MONGODB_DB`   | `norgelis` | Database name for the `bookings` collection.                            |
| `ADMIN_TOKEN`  | –          | Required in `x-admin-token` for `PATCH .../status`; unset ⇒ endpoint 503. |
| `SERVE_STATIC` | –          | `1` serves `site/dist` and falls back to `dist/index.html` for non-API GETs. |

Without `MONGODB_URI` the API keeps bookings in `server/.data/bookings.json`
(created on first write, git-ignored). That file store is single-process and is
meant for local development and small deployments. With MongoDB the store
creates a unique index on `code` plus indexes on `slot`, `mode + slot` and
`status`.

## Endpoints

All responses are JSON. Errors use a stable shape:

- validation: `400 { "error": "invalid", "issues": [...] }`
- unknown booking: `404 { "error": "not_found" }`
- slot already booked: `409 { "error": "slot_taken" }`
- rate limited: `429 { "error": "rate_limited" }` (10 booking attempts per IP per 10 minutes)
- admin token missing/wrong: `401 { "error": "unauthorized" }`
- admin disabled: `503 { "error": "admin_disabled" }`

### Create a booking

```bash
curl -s -X POST localhost:8787/api/bookings \
  -H 'content-type: application/json' \
  -d '{
    "mode": "shop",
    "jobIds": ["laptop-ssd-upgrade"],
    "device": { "brand": "Apple", "model": "MacBook Air", "year": "2021" },
    "issue": "Battery drains in about an hour after the last update.",
    "slot": "2030-06-03T09:00:00.000Z",
    "contact": { "name": "Andrei Popescu", "phone": "+40 721 123 456", "email": "andrei@example.com" },
    "estimate": { "priceFrom": 150, "priceTo": 300, "etaHours": [2, 4] },
    "lang": "ro"
  }'
# 201 { "code": "NT-4K7Q", "status": "received", "slot": "2030-06-03T09:00:00.000Z" }
```

Mobile jobs (`"mode": "mobile"`) also require `location` (max 200 chars).
Either `jobIds` (max 10) or `custom` (max 500 chars) must be provided.

### Public status

```bash
curl -s localhost:8787/api/bookings/nt-4k7q
# { "code": "NT-4K7Q", "status": "received", "mode": "shop",
#   "jobIds": ["laptop-ssd-upgrade"], "slot": "...", "updatedAt": "..." }
```

Codes are case-insensitive. The public view never includes contact details, the
issue text or the location.

### Taken slots

```bash
curl -s 'localhost:8787/api/slots?mode=shop&from=2030-06-01&to=2030-06-30'
# { "taken": ["2030-06-03T09:00:00.000Z"] }
```

Ranges are limited to 31 days. Only non-`done` bookings count as taken.

### Queue stats

```bash
curl -s localhost:8787/api/stats
# { "queue": 3, "byCategoryHint": { "laptop": 2, "coffee": 1 } }
```

`queue` counts `received`, `diagnosis`, `waiting-parts` and `repairing`.
`byCategoryHint` groups those by the first job id prefix before the first `-`
(bookings without job ids count as `custom`).

### Update a status (admin)

```bash
curl -s -X PATCH localhost:8787/api/bookings/NT-4K7Q/status \
  -H 'content-type: application/json' \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"status":"diagnosis"}'
# { "code": "NT-4K7Q", "status": "diagnosis", "updatedAt": "..." }
```

Valid statuses: `received`, `diagnosis`, `waiting-parts`, `repairing`, `ready`, `done`.

### Health

```bash
curl -s localhost:8787/api/health
# { "ok": true, "store": "file" }   (or "mongo")
```

## Hardening notes

- JSON bodies are capped at 20 kB.
- `POST /api/bookings` is limited to 10 attempts per IP per 10 minutes.
- `x-powered-by` is disabled.
- Unknown `/api` routes return a JSON 404 instead of the SPA shell.
- The error handler returns generic `{ error }` codes and never a stack trace.

## Files

| File              | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `server/index.ts` | Boots the store and HTTP listener, graceful shutdown.     |
| `server/app.ts`   | `createApp(store)` — routes, limits, static serving.      |
| `server/store.ts` | `Store` interface + `MongoStore` + `FileStore`.           |
| `server/schema.ts`| zod schema mirroring `BookingRequest` and status updates. |
| `server/code.ts`  | `NT-XXXX` code generation.                                |
| `server/app.test.ts` | node:test + fetch integration tests.                   |
