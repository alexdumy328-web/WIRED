# Booking API

Small Express 5 API behind the repair-shop site: bookings, public status lookup,
slot availability, queue stats, an admin status update, an optional AI-assisted
repair estimate, address search and pickup/drop-off quotes.

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
| `AI_API_KEY`   | –          | Enables `POST /api/estimate`. Unset ⇒ the endpoint answers 503 and the site uses its script estimate. |
| `AI_BASE_URL`  | `https://openrouter.ai/api/v1` | OpenAI-compatible base URL; the server posts to `${AI_BASE_URL}/chat/completions`. |
| `AI_MODEL`     | `openrouter/free` | Model id sent to the provider. |
| `PICKUP_DIESEL_LEI_PER_L` | `7.6` | Diesel price, lei per litre. |
| `PICKUP_CONSUMPTION_L_PER_100` | `7.5` | Van consumption, litres per 100 km. |
| `PICKUP_DRIVER_LEI_PER_HOUR` | `25` | Driver time, lei per hour. |
| `PICKUP_STOP_MINUTES` | `10` | Fixed stop at the customer's door, minutes. |
| `PICKUP_MIN_TRIP_LEI` | `25` | Minimum charge for one trip. |
| `PICKUP_MAX_KM` | `100` | One-way distance above which `tooFar` is true. |
| `PICKUP_URGENT_FACTOR` | `1.5` | Surcharge factor for an urgent trip. |

The `PICKUP_*` values are read when the app starts; non-numeric or negative values
are ignored and the matching `PICKUP_DEFAULTS` value is kept.

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
- AI estimate unavailable/disabled/provider error/timeout/invalid output: `503 { "error": "ai_unavailable" }`
- AI estimate rate limited: `429 { "error": "rate_limited" }` (20 requests per IP per 10 minutes, separate from bookings)
- geocoding upstream failure: `502 { "error": "geo_unavailable" }`
- geo/pickup rate limited: `429 { "error": "rate_limited" }` (60 requests per IP per 10 minutes, shared by the geo and pickup routes)

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

Bookings also accept optional `deviceValue` (`low`, `mid`, `high`, `premium`) and
an optional `aiEstimate` object (the estimate the customer saw). The estimate is
validated loosely, size-bounded and stored as given.

Shop bookings may include `pickup`:

```json
{
  "pickup": {
    "address": "Str. Palas 7A, Iași",
    "lat": 47.1585,
    "lon": 27.6014,
    "trips": "both",
    "urgent": true,
    "quote": { "totalLei": 120, "oneWayKm": 5, "urgentLei": 20 }
  }
}
```

`pickup` is rejected on `"mode": "mobile"`. `address` is at most 200 chars,
coordinates must be inside Romania, `trips` is `both`, `pickup` or `dropoff`,
`urgent` is optional, `quote.totalLei` and `quote.urgentLei` are 0–5000, and
`quote.oneWayKm` is 0–500. The quote is stored as the customer saw it, not
recomputed.

### AI-assisted estimate

```bash
curl -s -X POST localhost:8787/api/estimate \
  -H 'content-type: application/json' \
  -d '{
    "lang": "ro",
    "mode": "shop",
    "jobIds": ["laptop-battery"],
    "device": { "brand": "Apple", "model": "MacBook Air", "year": "2021" },
    "deviceValue": "mid",
    "issue": "Bateria tine aproximativ o ora dupa ultima actualizare."
  }'
# 200 {
#   "labourHours": [1, 2], "fineness": "fine", "consumables": "medium",
#   "rate": [150, 150], "labour": [180, 360],
#   "parts": [{ "name": "Baterie", "priceFrom": 200, "priceTo": 300 }],
#   "partsTotal": [200, 300], "total": [380, 660],
#   "confidence": "medium", "summary": "...", "questions": ["..."],
#   "model": "openrouter/free", "jobIds": ["laptop-battery"]
# }
```

The model only estimates effort: hands-on labour hours (`min`, `max`), fineness,
consumables load, likely parts with a price range in lei, catalog job ids, a short
summary in the request language, confidence and up to 3 questions. It never
computes money. The server derives `rate`, `labour`, `partsTotal` and `total`
from `src/lib/pricing.ts`, using the optional `deviceValue` for the hourly rate.

Request rules: `lang` is `ro` or `en`; `mode` is `shop` or `mobile`; `jobIds` is
at most 10 ids and unknown ids are ignored; device fields are optional and at
most 60 chars; `deviceValue` is the same enum as bookings; `issue` is 10–1500
chars. The response is cached in memory for 10 minutes (identical normalised
request, max 200 entries), so repeated estimates do not hit the provider.

Provider behaviour: any OpenAI-compatible Chat Completions API. The server posts
to `${AI_BASE_URL}/chat/completions` with `temperature: 0.2`,
`max_tokens: 700`, `response_format: { "type": "json_object" }` and an
`X-Title: Norgelis Tech estimate` header. If the provider rejects
`response_format` with a 400, it retries once without it. Model output that fails
validation is retried once; after that, a provider error, timeout (15 s) or
invalid output answers `503 { "error": "ai_unavailable" }` and the site falls
back to its script estimate. The API key and the customer's text are never
logged.

Defaults were checked against the provider docs:

- OpenRouter: base URL `https://openrouter.ai/api/v1`, model `openrouter/free`
  (present in `GET /api/v1/models`). `X-Title` is OpenRouter's optional
  attribution header; the docs also show the newer `X-OpenRouter-Title` spelling.
- OpenCode Zen (alternative, OpenAI-compatible endpoint):
  `AI_BASE_URL=https://opencode.ai/inference/openai/v1` with a free model id such
  as `AI_MODEL=deepseek-v4.1-flash-free`. The Zen docs note that free-tier chat
  models require the OpenCode client; from another client, use a paid model or
  Go.

### Address search

```bash
curl -s 'localhost:8787/api/geo/search?q=Palas&lang=ro'
# { "results": [
#   { "label": "Str. Palas 7A, Iași, Iași", "lat": 47.1585, "lon": 27.6014, "city": "Iași" }
# ] }
```

Photon is queried with `limit=6`, the Iași bias point and the Romania bounding box.
`q` must be 3–120 chars; `lang` is `ro` or `en` (default `ro`). Labels are built
from street + housenumber, locality and county. If Photon fails or times out the
endpoint answers `502 { "error": "geo_unavailable" }`.

### Reverse geocoding

```bash
curl -s 'localhost:8787/api/geo/reverse?lat=47.16&lon=27.6&lang=ro'
# { "label": "Str. Palas 7A, Iași, Iași", "lat": 47.16, "lon": 27.6, "city": "Iași" }
```

`lat` and `lon` must be numbers inside the Romania bounding box, otherwise 400.

### Pickup quote

```bash
curl -s 'localhost:8787/api/pickup/quote?lat=47.16&lon=27.6&trips=both'
# { "oneWayKm": 5, "oneWayMin": 10, "trips": "both", "totalKm": 20,
#   "fuelLei": 11, "timeLei": 25, "perTripLei": 25, "urgent": false,
#   "urgentLei": 0, "totalLei": 50, "insideIasi": true, "tooFar": false,
#   "rates": { ... }, "routed": true,
#   "geometry": [[47.166015, 27.558417], [47.16, 27.6]] }
```

`trips` is `both` (default), `pickup` or `dropoff`. Add `urgent=1` for the urgent
surcharge (`urgentFactor`); any other `urgent` value means normal. The route is
shop → customer through OSRM; its distance (m → km) and duration (s → min) feed
`quotePickup` from `src/lib/pickup.ts`, including the urgent flag. `geometry` is
returned as `[lat, lon]` pairs. If OSRM fails or times out, the quote falls back
to `haversineKm × 1.3` and 2 min per km with `routed: false` and `geometry: null`.

`insideIasi` is true when the reverse-geocoded city is Iași (`Iasi`/`Iași`,
case-insensitive) or, when the city is unknown, when the point is within
`IASI_RADIUS_KM` of the city centre. `tooFar` comes from `PICKUP_MAX_KM`.

### Upstream etiquette

- Every Photon/OSRM request sends `User-Agent: NorgelisTech-site/1.0` and times
  out after 6 seconds.
- Search and reverse responses are cached in memory for 1 hour; OSRM routes for
  24 hours. Coordinate cache keys are rounded to 5 decimals, and each cache holds
  at most 500 entries.
- The geo and pickup routes share a limiter of 60 requests per IP per 10 minutes.

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
- `POST /api/estimate` has its own limiter: 20 attempts per IP per 10 minutes.
- `/api/geo/*` and `/api/pickup/*` share a 60 attempts per IP per 10 minutes limiter.
- `x-powered-by` is disabled.
- Unknown `/api` routes return a JSON 404 instead of the SPA shell.
- The error handler returns generic `{ error }` codes and never a stack trace.

## Files

| File              | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `server/index.ts` | Boots the store and HTTP listener, graceful shutdown.     |
| `server/app.ts`   | `createApp(store)` — routes, limits, static serving.      |
| `server/estimate.ts` | AI prompt/provider call, output validation, cache; money comes from `src/lib/pricing.ts`. |
| `server/geo.ts`   | Photon search/reverse, labels, 1-hour cache.              |
| `server/pickup-service.ts` | OSRM route + haversine fallback; money comes from `src/lib/pickup.ts`. |
| `server/upstream.ts` | Shared upstream fetch: User-Agent, 6 s timeout, JSON.  |
| `server/cache.ts` | Tiny TTL cache with a 500-entry cap.                      |
| `server/store.ts` | `Store` interface + `MongoStore` + `FileStore`.           |
| `server/schema.ts`| zod schemas for bookings, status updates, estimates and pickup. |
| `server/code.ts`  | `NT-XXXX` code generation.                                |
| `server/app.test.ts` | node:test + fetch integration tests.                   |
| `server/estimate.test.ts` | estimate tests with an injected provider `fetch`. |
| `server/geo.test.ts` | geo/pickup tests with an injected upstream `fetch`.   |

## Accounts, roles and dashboards

Better Auth (self-hosted, sessions in the same MongoDB) is mounted at `/api/auth/*`
by `server/platform.ts`. It only starts when the store is MongoDB; with the JSON file
store `/api/auth`, `/api/me`, `/api/admin` and `/api/dev` answer `503 auth_unavailable`.
Copy `.env.example` to `.env.local` for the variable names.

| Variable | Meaning |
| --- | --- |
| `BETTER_AUTH_SECRET` | Required in production (32+ chars); development uses a temporary one. |
| `BETTER_AUTH_URL` | Public origin of the site. Default in development: `http://localhost:5173`. |
| `APP_ORIGINS` | Extra trusted origins, comma separated. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Enable Google sign-in. Redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`. |
| `RESEND_API_KEY` / `MAIL_FROM` | Email delivery. Without them development uses the `dev_outbox` collection; production answers 503. |
| `OWNER_EMAILS` / `DEV_EMAILS` | Comma separated emails that get the role once their address is verified. Every `OWNER_EMAILS` address also gets a mail for each new booking. |
| `TRUST_PROXY` | Set behind a reverse proxy so `req.ip` is the client address. |

Sign-in: Google, email and password (10+ characters, email confirmed by a 6-digit code)
and email code (10 minutes, locks after 5 wrong tries). Roles are `customer`, `owner`
and `dev`; `requireRole()` reads the database, not the cookie cache. Only a verified email
can get a role from the env lists; they raise a role, never lower it.

Routes (all validated with zod, per-IP limiters, JSON errors):

- `GET /api/me`, `GET /api/me/bookings`, `GET /api/settings/public`
- Owner or dev: `GET /api/admin/bookings`, `GET /api/admin/bookings/:code`,
  `PATCH /api/admin/bookings/:code/status` (status, optional note, optional `finalLei`,
  `notify`; history and audit),
  `GET /api/admin/calendar?week=`, `GET /api/admin/pickups?date=`, `GET /api/admin/stats`,
  `GET|PUT /api/admin/settings` (pickup and labour rates with bounds; the pickup quote and
  the AI estimate read them)
- Dev only: `GET /api/dev/health|env|errors|audit|outbox|rate-limits|users`,
  `PATCH /api/dev/users/:id/role`

Booking emails (`server/notify.ts`): the customer gets a confirmation when they leave an
email, and a mail on every status change the owner saves with "Email the customer" ticked.
These mails hold only text the server controls (code, time, job names from the price list,
prices, a `/?cod=NT-XXXX#status` link), never what was typed into the form. Owners get the full
booking with an `/admin?cod=` link. A failed mail never fails the booking or the status change.

`finalLei` is what was charged for the repair (parts included, transport not). The stats count it
for finished jobs and fall back to the estimate midpoint when it is missing.

`PATCH /api/bookings/:code/status` with `x-admin-token` still works when `ADMIN_TOKEN` is set.
Every response carries the headers from `server/security/policy.ts`; `scripts/vercel-build.mjs`
puts the same ones on the static site.
