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
- Xcode 16+ (iOS 18+ SDK)
- XcodeGen: `brew install xcodegen`

## Generate, Build, and Run

### 1. Generate Xcode project
```bash
cd ios
xcodegen generate
```
Produces `NorgelisTech.xcodeproj`.

### 2. Build from command line
```bash
cd ios
xcodebuild \
  -project NorgelisTech.xcodeproj \
  -scheme NorgelisTech \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  build
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
    │   ├── DevSettingsSheet.swift       # API base URL and dev controls
    │   ├── Driver/                      # MapKit view, stop details, stops list
    │   ├── Owner/                       # Stats, radar card, booking details
    │   └── Customer/                    # Status lookup, live driver arrival
    └── Resources/
        ├── Info.plist                   # Location descriptions and capabilities
        ├── ro.lproj/Localizable.strings # Romanian text (default)
        ├── en.lproj/Localizable.strings # English text
        └── Assets.xcassets/             # App icons and AccentColor
```

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
- `GET /api/admin/bookings` — Owner bookings list.
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
