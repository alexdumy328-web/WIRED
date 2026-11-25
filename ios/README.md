# Norgelis Tech iOS App

SwiftUI app for Norgelis Tech (electronics repair shop, Iași). Targets iOS 18.0+, iPhone only, Romanian and English.

Connects to the Express API in `site/server/`. Nobody picks a role. The server's answer for the signed-in account decides what the app shows.

| Who | What they get |
| --- | --- |
| Not signed in | A welcome screen. Sign in or create an account first. Booking a repair and tracking one by code also work without an account, as on the website. |
| Customer | My repairs (every booking made with the account, with status and a Call the driver button on pickup jobs), Track by code, Account. A plus button books a new repair. |
| Driver | Its own small app: Today (today's total driving distance and time, then the stops), Jobs (pickups and deliveries only), the Driver map, Schedule (pickups and deliveries by day) and Account. No customers list, warranties, money, stats, settings, walk-ins or workshop visits, in the app or on the server (`/api/driver/*`). |
| Technician | The workshop console: Today, Jobs, Driver map, Schedule, More. No prices, stats or settings. |
| Owner, dev | The same, plus Stats, Workshop settings and the server address. |

The driver map is part of every staff account. Drivers get the `driver` role (`DRIVER_EMAILS` on the server, or set in the website's dev dashboard or by an owner); it opens the small driver app above instead of the console, and the server limits it to `/api/driver/*`. Technicians, owners and devs can drive too. A role change shows in the app after the next sign-in.

A **demo account** (listed in the server's `DEMO_EMAILS`, a customer account with no real access) opens the staff console on sample data, with a simulated drive. It is for App Review and demos. Sample data exists nowhere else: there is no switch for it.

## Project management

Project file: `ios/project.yml` (XcodeGen). It keeps git diffs clean, avoids `.pbxproj` merge conflicts, and sets the bundle id (`ro.norgelis.app`), version, build settings and the test target in one file. Regenerate with `xcodegen generate` after you add or remove files.

## Requirements

- macOS 15+
- Xcode 16 or newer with an iOS 18+ simulator runtime (built and tested on Xcode 27.2, iOS 27.2)
- XcodeGen: `brew install xcodegen`
- Node 22.18+ only to refresh the price list (see Booking)

## Build and run

```bash
cd ios
xcodegen generate
xcodebuild -project NorgelisTech.xcodeproj -scheme NorgelisTech \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' \
  -derivedDataPath build \
  NORGELIS_API_BASE_URL=http://localhost:8790 build
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/NorgelisTech.app
xcrun simctl launch booted ro.norgelis.app
```

Use any simulator name that `xcrun simctl list devices available` shows. If it lists no iOS runtime, install one with `xcodebuild -downloadPlatform iOS`.

Run the unit tests with the same command and `test` instead of `build`.

In T3 Code, call `device_list`, then `device_open`, and drive the simulator with the `agent-device` command it returns.

## Configuration (build settings)

Everything that differs between builds is a build setting in `project.yml`. Override one on the `xcodebuild` command line.

| Setting | What it does | Default |
| --- | --- | --- |
| `NORGELIS_API_BASE_URL` | The server the app talks to. | `https://norgelis-tech.vercel.app` (production) |
| `NORGELIS_SITE_ORIGIN` | The website origin Better Auth trusts (`BETTER_AUTH_URL` or `APP_ORIGINS`). Needed when the API address is not that origin, for example `http://localhost:5173` in dev. | empty |
| `NORGELIS_PHONE`, `NORGELIS_DRIVER_PHONE` | The shop and driver numbers (Call, WhatsApp, Call the driver). The app only builds `tel:` links, it never dials by itself. An empty value hides the matching row. The driver number falls back to the shop number. | shop `+40 (771) 332 210`, driver `(0758) 561 001` |
| `NORGELIS_SUPPORT_EMAIL` | Fallback support address for Account. The server's `SUPPORT_EMAIL` (Vercel) wins. | empty |
| `NORGELIS_PRIVACY_URL`, `NORGELIS_TERMS_URL` | Legal links in Account. When empty they follow the server address: `<server>/confidentialitate` and `<server>/termeni`, pages the website serves. | empty |
| `NORGELIS_FEEDBACK_URL` | Fallback Google Form link for in-app feedback. The server's `FEEDBACK_URL` (Vercel, read from `GET /api/config` at launch) wins, so the link changes without a new build. Neither set hides the row. | empty |
| `NORGELIS_APP_LINK_DOMAIN` | The website domain for Universal Links (booking links in emails open the app) and shared passwords. Release only; the server must have `APPLE_TEAM_ID`. | `norgelis-tech.vercel.app` |
| `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` | Version and build number. Raise the build number for every App Store upload. | `1.0.0`, `1` |

Debug builds also allow a plain HTTP server on the local network (`NSAllowsLocalNetworking` and the local network prompt text, added through plist preprocessing). Release builds are HTTPS only and have neither key.

Owners and devs can change the server address at runtime in More → Server address. The field accepts HTTPS addresses (Release), applies one only after it answered the health check, and asks first, because the session belongs to the old server and ends. A saved address that this build would not accept is ignored at launch, and the address resets to the build default at sign-out.

## Sign in

Sign-in uses the website's Better Auth routes: email code, password, sign-up with email confirmation, password reset. Session cookies live in the iOS Keychain, are cleared when the server address changes, and never enter git. Google sign-in is not in the app yet, because it needs a server-side handoff (one-time token and a trusted app origin).

Account deletion (Account → Delete account) calls `POST /api/auth/delete-user`, which the site now enables for customer accounts. It deletes the user and sessions and keeps bookings and invoices, unlinked from the account. Staff accounts are refused (the owner manages them). Better Auth wants a session under a day old or the password, so an older session gets a password prompt and an option to sign in again. If the server answers 404 (older server) the app offers an email request instead.

Signing out or deleting the account also stops any trip and GPS, clears the stops and lookups, resets the console's role and tab, and puts the server address back to the build default.

## Booking

Customers book from the welcome screen (no account) or the plus button in My repairs. The form stops at the server's limits (10 jobs, 500/1500/60/200/80 characters for the free-text fields), so a long paste cannot fail later with a generic error. The form posts to `POST /api/bookings`, the same call as the website, and the server checks the jobs, the slot and the prices again.

- Kind of visit: workshop, pickup and delivery, or on site.
- Jobs come from `NorgelisTech/Resources/catalog.json`, which `scripts/export-catalog.mjs` generates from the site's price list and holiday list (`node ios/scripts/export-catalog.mjs` from the repository root). Run it again whenever the site's catalog changes.
- Date uses the system calendar popover. A Sunday or public holiday moves to the next open day. Times are 1-hour workshop slots or 2-hour on-site windows, minus the ones `GET /api/slots` reports as taken (`Services/SlotPlanner.swift` mirrors `site/src/lib/slots.ts`).
- Pickup uses `GET /api/geo/search` for the address and `GET /api/pickup/quote` for the transport price.
- Customer details prefill from the account. A confirmation shows the booking code.

## Driver and live tracking

- Today's stops come from `GET /api/driver/pickups?date=` and refresh when the Driver tab opens. Done comes from the server, so it survives a reinstall. Completing a stop updates the booking: a delivery sets it to `done` and emails the hand-back, a pickup records the collection.
- The map draws the real driving route (Apple Maps directions) through the remaining stops. Navigate opens Waze or Apple Maps (`LSApplicationQueriesSchemes` lists `waze`).
- **Tracking is real.** During a trip the phone posts its position to `POST /api/driver/location` and deletes it when the trip ends (`Services/DriverSharing.swift`). It sends at most one request at a time, 5 seconds apart, only when the driver moved 15 m or 20 seconds passed, and nothing when no trip runs. The `location` background mode keeps it going when the driver switches to Waze (blue indicator on, only during a trip).
- **Customers** see the driver on the booking while one is heading to it (`GET /api/bookings/:code/driver`, polled every 5 s when the driver is within 10 minutes, 10 s otherwise, 20 s when nobody is sharing, with backoff). **Owners** see every sharing driver on the Today tab (`GET /api/admin/driver/live`, every 10 s).
- The server keeps one document per driver, overwritten (no trail), a 3 second read cache, and a 24 hour expiry. It is polling, not sockets, because the site runs on Vercel functions (issue 13).
- Customers call the driver from a pickup booking. The driver calls the customer from the stop.

## Push notifications and the Live Activity

- **Status alerts.** A signed-in customer is asked for notifications once, when their repairs list has something in it. The phone's token goes to `POST /api/push/device`. Every status change the customer is emailed about is also pushed. The server sends localisation keys (`push.*` in `Localizable.strings`), so the alert shows in the phone's language. Tapping it opens the booking.
- **Live Activity** (`NorgelisTechWidgets/`, data in `Shared/DriverActivityAttributes.swift`). When the driver sets off to a booking, the lock screen and the Dynamic Island show the shop logo, a live countdown to arrival, the arrival time and a progress track from van to house. The server starts it by push-to-start, updates it at most every 30 s (or when the ETA changes) and ends it when the driver collects, delivers or turns away. While the app shows the driver it also starts and updates the activity itself, so it works without push too (Debug, free team). Tapping it opens the booking (`norgelis://booking/<code>`).
- **Signing.** Push and associated domains need the paid team: `NorgelisTech.entitlements` is used by Release only. Debug builds stay installable with a free team. On the server, set `APNS_KEY_ID`, `APNS_TEAM_ID` (or `APPLE_TEAM_ID`) and `APNS_KEY` (the .p8 text); without them nothing is pushed and the app polls as before.
- **Universal Links.** Booking links in emails (`/?cod=NT-XXXX`) and `/cont` open the app when installed. The server serves `/.well-known/apple-app-site-association` from `APPLE_TEAM_ID`.

## Owner console

It mirrors the `/admin` dashboard on the site.

| Tab | What it does |
| --- | --- |
| Today | Counts, today's schedule and pickups, jobs waiting for hand-back, the driver card and a New walk-in button. |
| Jobs | Search, status chips, kind filter. Tap a job for the work order. |
| Driver | The driver map. |
| Schedule | Week strip with busy dots, the day's visits and pickups. |
| More | Customers, Warranties (issue, void, share PDF), Stats and Workshop settings (owners and devs), Account, and the server address (owners and devs). |

Roles follow the server (`GET /api/me`). A technician never sees `finalLei`, Stats or Settings.

### Demo account

The server marks demo accounts (`DEMO_EMAILS`). For them the console and the driver map use `MockOwnerRepository` and a simulated drive, a rose notice shows, and nothing is sent to the server. Real accounts never see sample data. A demo account holds no staff role, so its credentials open nothing real on the website either.

Not built yet: intake photo capture. PDFs download only from a real server.

## App architecture

```
ios/
├── project.yml                  # XcodeGen spec (targets, build settings, schemes)
├── scripts/export-catalog.mjs   # Site price list and holidays -> catalog.json
├── docs/                        # App Store guide and screenshots
├── NorgelisTechTests/           # Unit tests
├── NorgelisTechWidgets/         # Live Activity (lock screen, Dynamic Island)
├── Shared/                      # Live Activity data, in the app and the widget
└── NorgelisTech/
    ├── App/                     # Entry point, AppState (driver stops, trips, lookup)
    ├── Models/                  # Booking, Catalog, Shop, stops, staff roles
    ├── Services/                # APIClient, AuthStore, repositories, BookingModel, SlotPlanner, location, route planner
    ├── Views/
    │   ├── RootView.swift       # Splash, welcome, customer or staff home
    │   ├── Welcome/             # Sign in first, guest booking and tracking
    │   ├── Auth/                # Sign in form and Account
    │   ├── Booking/             # New booking form
    │   ├── Customer/            # My repairs, Track, booking card, live tracking
    │   ├── Driver/              # Map and panel
    │   ├── Owner/               # Console tabs (Console/), driver radar card
    │   └── Settings/            # Server address (owners and devs)
    └── Resources/               # Info.plist, PrivacyInfo.xcprivacy, catalog.json, strings (ro, en), assets
```

## Look and feel

The app uses the website's colour system in light and dark (`Views/Theme.swift`): gold for the workshop, green for pickup and delivery, blue for on site. Status dots use their own colours. When `estimate.priceTo` is 0 the app shows "După diagnostic" instead of a price. The welcome screen and the booking steps follow the site's call, directions and book actions. The app icon is the site favicon mark (`AppIcon.svg`) at 1024 px.

## Screenshots

`docs/screenshots/` holds simulator captures. The `prod-` files show the production flow: welcome, booking form, calendar, confirmation, customer repairs and call the driver, and the driver app (Today, Jobs, Schedule, one job, the live map from a real test server). The others show the driver panel, sign-in and console screens.

## API endpoints used

- `GET /api/health`, `GET /api/me`, `GET /api/me/bookings`, `GET /api/bookings/:code`
- Auth: `POST /api/auth/...` (sign in, sign up, email OTP, reset, sign out, delete user)
- Booking: `POST /api/bookings`, `GET /api/slots`, `GET /api/geo/search`, `GET /api/pickup/quote`
- Staff: `PATCH /api/admin/bookings/:code/status` (stop done), `GET /api/admin/bookings`, `/bookings/:code`, `PATCH /bookings/:code/status`, intake, `/walk-ins`, `/customers`, `/warranties`, `/calendar`, `/busy`, `/pickups`, `/counts`, `/stats`, `/settings`

### Live tracking

`POST /api/driver/location`, `DELETE /api/driver/location`, `GET /api/bookings/:code/driver`, `GET /api/admin/driver/live`. The map polls; alerts and the Live Activity are pushed.

### Push and config

`POST`/`DELETE /api/push/device`, `POST /api/bookings/:code/activity`, `GET /api/config`.
