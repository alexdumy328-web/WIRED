# Norgelis Tech iOS App

SwiftUI app for Norgelis Tech (electronics repair shop, Iași). Targets iOS 18.0+.

Connects to the Express API in `site/server/`. Supports three roles:
- **Driver:** sees daily stops in order, shows customer address and contact, taps "Plec spre client" to transmit live location and arrival estimates.
- **Owner:** tracks repair queue, today's pickups, calendar busy dots, and live driver position.
- **Customer:** looks up booking by code (`NT-XXXX`), tracks repair status, and views approaching driver with arrival countdown.

## Project Management

Project file: `ios/project.yml` (XcodeGen).

Why XcodeGen:
- Keeps git diffs clean; avoids `.pbxproj` merge conflicts and UUID churn.
- Configures target settings, bundle ID (`ro.norgelis.app`), and background capabilities in one declarative file.
- Generates the Xcode project reproducibly with `xcodegen generate`.

## Requirements

- macOS 15+
- Xcode 16 or newer with an iOS 18+ simulator runtime (built and tested on Xcode 27.2, iOS 27.2)
- XcodeGen: `brew install xcodegen`

## Generate, Build, and Run

### 1. Generate Xcode project
```bash
cd ios
xcodegen generate
```
Produces `NorgelisTech.xcodeproj`.

### 2. Build for the simulator
```bash
cd ios
xcodebuild \
  -project NorgelisTech.xcodeproj \
  -scheme NorgelisTech \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' \
  -derivedDataPath build \
  build
```
Use any simulator name that `xcrun simctl list devices available` shows. If it lists no iOS runtime, install one with `xcodebuild -downloadPlatform iOS` (about 8 GB).

### 2b. Install and launch on a booted simulator
```bash
xcrun simctl boot "iPhone 18 Pro"        # skip if already booted
xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/NorgelisTech.app
xcrun simctl launch booted ro.norgelis.app
```

### 3. Run in Xcode
```bash
open ios/NorgelisTech.xcodeproj
```
Select target `NorgelisTech`, choose an iOS 18+ simulator, and press `Cmd + R`.

### 4. Run in T3 Code Device Panel
1. Call `device_list` to find device IDs.
2. Call `device_open` with `hostId: "local"` and `deviceId`.
3. Launch with the CLI returned by `device_open`:
   ```bash
   agent-device open ro.norgelis.app
   ```
4. Verify with `device_screenshot`.

## App Architecture

```
ios/
├── project.yml                          # XcodeGen spec
├── README.md                            # Documentation
├── .gitignore                           # Xcode artifacts exclusions
├── NorgelisTech.xcodeproj               # Generated Xcode project
└── NorgelisTech/
    ├── App/
    │   ├── NorgelisTechApp.swift        # App entry point
    │   └── AppState.swift               # Central UI and tracking state
    ├── Models/
    │   ├── Booking.swift                # API booking payload
    │   ├── BookingStatus.swift          # Status enum
    │   ├── PickupStop.swift             # Scheduled stop model
    │   ├── UserRole.swift               # Driver, Owner, Customer
    │   └── DriverLocation.swift         # Location and tracking payloads
    ├── Services/
    │   ├── APIClient.swift              # Backend API client
    │   ├── LocationService.swift        # CLLocationManager wrapper
    │   └── MockData.swift               # Iași mock stops and bookings
    ├── Views/
    │   ├── RootView.swift               # Role container
    │   ├── RolePickerBar.swift          # Dev role selector
    │   ├── Theme.swift                  # Site colours, status dots, kind chips, price row
    │   ├── DevSettingsSheet.swift       # API base URL and dev controls
    │   ├── Driver/                      # MapKit view, stop details, stops list
    │   ├── Owner/                       # Stats, radar card, booking details
    │   └── Customer/                    # Status lookup, live driver arrival
    └── Resources/
        ├── Info.plist                   # Location descriptions and capabilities
        ├── ro.lproj/Localizable.strings # Romanian text (default)
        ├── en.lproj/Localizable.strings # English text
        └── Assets.xcassets/             # App icon (site favicon mark) and AccentColor
```

## Driver navigation

- The map draws the real driving route (Apple Maps directions) from the workshop to the next stop, or from the driver's position to the stop in progress. The card shows distance and travel time.
- The bottom card is native Liquid Glass on iOS 26 and later and a light material before that. Stop pins are round: green for a stop, red with an exclamation mark when urgent, grey with a check when done.
- Three buttons under the top bar fit the route, center on the driver or center on the workshop.
- **Navigate** opens a menu with Waze and Apple Maps. Waze starts turn-by-turn through `waze://`. When Waze is not installed it opens the `waze.com/ul` link, which offers the App Store. `LSApplicationQueriesSchemes` lists `waze` so the app can check for it.
- Navigate is on the map card, on the active trip card and in the stop detail sheet.

## Owner console

The Owner role opens the workshop console. It mirrors the `/admin` dashboard on the site, including the workshop features from PR 6.

| Tab | What it does |
| --- | --- |
| Today | Counts (active, to hand back, visits, pickups), today's schedule, today's pickups, jobs waiting for hand-back, the driver card and a New walk-in button. |
| Jobs | Search, status chips (with "to hand back" for ready and unrepairable), kind filter (workshop, pickup, on site). Tap a job for the work order. |
| Customers | Search, archived list, create and edit, company details, a customer's jobs and warranties. Archiving is for owners. |
| Schedule | Week strip with busy dots, the day's visits, and the day's pickups with Navigate (Waze or Apple Maps), call and the transport total. |
| More | Warranties (issue, void, share PDF), Stats and Workshop settings (owners only), role preview and the data source switch. |

The work order covers status including `unrepairable`, an internal note, whether to email the customer, the price charged (owners only), the service sheet (take the device in, edit it), repair notes, the customer, pickup details, the warranty and the status history. A walk-in creates a customer if needed, a job and a numbered service sheet in one step.

Roles follow the server. A technician works on devices and never sees `finalLei`, Stats or Settings. Owners and devs see everything. In the live API mode the role comes from `GET /api/me`.

### Data sources

`OwnerRepository` has two implementations.

- **Sample data** (default). `MockOwnerRepository` keeps believable data around today's date in memory. Every flow works offline, and changes vanish on restart. More → Preview as switches the role.
- **Live API.** Turn off Sample data, set the base URL in Dev settings, then sign in from the person icon at the top. Sign-in uses the website's Better Auth routes (email code, password, sign-up with email confirmation, password reset). The session cookies are kept in the iOS Keychain, are cleared when the base URL changes, and never enter git. Google sign-in is not in the app yet, because it needs a server-side handoff.

Not built yet. Intake photo capture and viewing (the count shows), and push notifications. PDFs (service sheet, warranty) download and share only against the live API, since the server makes them.

## Screenshots

`docs/screenshots/` holds simulator captures. `driver-list.png`, `driver-stop.png` and `driver-trip.png` show the driver panel (stop list, one stop with its X, and a trip with the turn banner and slide to confirm). `sign-in.png` shows sign-in. `console-today.png`, `console-job.png`, `console-schedule.png` and `console-stats.png` show the owner console. `customer.png` and `home-icon.png` show the customer lookup and the app icon.

## Look and feel

The app uses the website's colour system, in light and dark (`Views/Theme.swift`).

- Kind of job: gold for the workshop, green for pickup and delivery, blue for on site.
- Status dots use their own colours and never gold, green-as-kind or blue. Received is grey, diagnosis is a violet ring, repairing is violet, waiting for parts is rose, ready is green, done is faded ink and cancelled is a hollow grey ring.
- When `estimate.priceTo` is 0 the app shows "După diagnostic" / "After diagnosis" instead of a price, as the site does.
- The app icon is the site favicon mark (`ios/AppIcon.svg`) rendered at 1024 px with no alpha.

## Roles

The role picker is for development. A local account can hold both the owner and dev roles on the server (`OWNER_EMAILS` and `DEV_EMAILS` in `site/.env.local`, not committed). The dev role includes everything the owner can do, so the app does not need to hide owner screens from it.

## Permissions and Background Capability

Configured in `NorgelisTech/Resources/Info.plist`:
- `NSLocationWhenInUseUsageDescription`:
  "Norgelis Tech folosește locația pentru navigație și pentru a indica poziția pe hartă în timpul preluărilor și livrărilor."
- `NSLocationAlwaysAndWhenInUseUsageDescription`:
  "Norgelis Tech necesită acces continuu la locație în fundal pentru a transmite în timp real poziția șoferului și estimarea sosirii către atelier și client în timpul cursei."
- Background location capability declared:
  ```xml
  <key>UIBackgroundModes</key>
  <array>
      <string>location</string>
  </array>
  ```
- `LocationService.swift` sets `allowsBackgroundLocationUpdates = true` and `pausesLocationUpdatesAutomatically = false` during active trips.

## API Integration

Base URL: configurable in Dev Settings, defaults to `http://localhost:8787`.

### Current Endpoints Used
- `GET /api/health` — API health check.
- `GET /api/bookings/:code` — Public booking status lookup.
- `GET /api/me/bookings` — Customer booking list.
- `GET /api/admin/bookings?mode=shop|pickup|mobile&limit=&skip=` — Owner bookings, returned as `{ total, items }`. `shop` is workshop visits with no pickup, `pickup` is shop jobs we collect or deliver, `mobile` is on site.
- `GET /api/admin/pickups?date=YYYY-MM-DD` — Owner pickups for a date.
- `GET /api/admin/calendar?week=YYYY-MM-DD` — Booked slots for a week.
- `GET /api/admin/busy?from=YYYY-MM-DD&to=YYYY-MM-DD` — Returns `{ days: { "YYYY-MM-DD": { total, pickups } } }` for calendar load dots.
- `PATCH /api/admin/bookings/:code/status` — Status update with optional note.

### Phase 2 Endpoints (Live Tracking)

Later phases will connect driver GPS streaming to customer and owner views.

1. **`POST /api/driver/location`**
   - Sent by driver app every 5–10 seconds while driving to a stop.
   - Request body:
     ```json
     {
       "driverId": "driver-01",
       "bookingCode": "NT-4K7Q",
       "latitude": 47.1625,
       "longitude": 27.5750,
       "heading": 85.0,
       "speedKmh": 38.5,
       "timestamp": "2026-11-21T10:32:00.000Z"
     }
     ```
   - Server stores latest location and updates ETA.

2. **`GET /api/bookings/:code/driver`**
   - Read by customer app.
   - Response:
     ```json
     {
       "isEnRoute": true,
       "driverName": "Alexandru",
       "latitude": 47.1625,
       "longitude": 27.5750,
       "heading": 85.0,
       "etaMinutes": 11,
       "updatedAt": "2026-11-21T10:32:00.000Z"
     }
     ```

3. **`GET /api/admin/driver/live`**
   - Read by owner app/dashboard to display all active drivers.

4. **SSE / Polling:**
   - Polling fallback: `GET /api/bookings/:code/driver` every 5 seconds.
   - SSE alternative: `GET /api/driver/stream?code=NT-4K7Q` pushing coordinate and ETA updates.
