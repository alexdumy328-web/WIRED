# Norgelis Tech — Native iOS App

Native iOS application for **Norgelis Tech** (electronics repair shop in Iași, Romania), built with **SwiftUI** targeting **iOS 18.0+**.

The app connects to the Norgelis Express API (`site/server/`) and supports three primary user roles:
1. **Driver (Șofer):** Daily scheduled pickup and delivery stops on MapKit, with one-tap *"Plec spre client"* (*I'm on my way*) to stream live GPS location and arrival estimates.
2. **Owner (Proprietar / Atelier):** Overview of active repair jobs, today's pickups, and real-time driver radar.
3. **Customer (Client):** Booking lookup by code (`NT-XXXX`), repair status timeline, and real-time driver tracking when a pickup/delivery is en route.

---

## 1. Project Management & Rationale

This project uses **XcodeGen** (`project.yml`) rather than a hand-edited `project.pbxproj` or a pure Swift Package-based app:
- **No Git Merge Conflicts:** Xcode's `.pbxproj` files frequently produce complex merge conflicts and UUID churn. `project.yml` is declarative, concise, and human-readable.
- **Automated Capability & Plist Management:** XcodeGen cleanly manages iOS capabilities (such as Background Modes for location tracking: `UIBackgroundModes: ["location"]`), bundle identifiers (`ro.norgelis.app`), and localization catalogs without manual Xcode inspector changes.
- **Why not pure Swift Package apps:** While Swift Packages are useful for libraries, standalone SPM app bundles have limited native support for iOS background capabilities, complex entitlement provisioning, and App Store metadata pipelines.

---

## 2. Prerequisites

- **macOS:** Sequoia 15.0 or later
- **Xcode:** Xcode 16.0 or later (with iOS 18.0+ SDK)
- **XcodeGen:** Installable via Homebrew:
  ```bash
  brew install xcodegen
  ```

---

## 3. How to Generate, Build, and Run

### Step 1: Generate the Xcode Project
Run XcodeGen from the `ios/` folder:
```bash
cd ios
xcodegen generate
```
This generates `NorgelisTech.xcodeproj`.

### Step 2: Build for iOS Simulator (CLI)
Build from the command line using `xcodebuild`:
```bash
xcodebuild \
  -project NorgelisTech.xcodeproj \
  -scheme NorgelisTech \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  build
```

### Step 3: Run on iOS Simulator

#### Option A — Via T3 Code Device Panel
1. List available devices:
   - Call MCP tool `device_list`.
2. Open the simulator:
   - Call MCP tool `device_open` with `hostId: "local"` and `deviceId`.
3. Install and launch the app via the returned `agent-device` CLI:
   ```bash
   agent-device open ro.norgelis.app
   ```
4. Verify execution:
   - Call `device_screenshot` to capture the running UI in T3 Code.

#### Option B — Via Xcode
```bash
open NorgelisTech.xcodeproj
```
Select the **NorgelisTech** scheme, pick any **iOS 18+ Simulator** (e.g., iPhone 16 Pro), and press **⌘R** (Run).

---

## 4. App Structure & Skeleton

```
ios/
├── project.yml                          # XcodeGen project specification
├── README.md                            # Documentation and architecture guide
├── .gitignore                           # Xcode user data & derived data exclusions
├── NorgelisTech.xcodeproj               # Generated Xcode project
└── NorgelisTech/
    ├── App/
    │   ├── NorgelisTechApp.swift        # @main SwiftUI App entry point
    │   └── AppState.swift               # Central state (role, stops, en-route state, bookings)
    ├── Models/
    │   ├── Booking.swift                # Domain model matching Express API schema
    │   ├── BookingStatus.swift          # Status enum (received, diagnosis, waiting-parts, etc.)
    │   ├── PickupStop.swift             # Driver daily stop representation
    │   ├── UserRole.swift               # Driver, Owner, Customer roles
    │   └── DriverLocation.swift         # Live tracking payloads for Phase 2
    ├── Services/
    │   ├── APIClient.swift              # URLSession client pointed at configurable base URL
    │   ├── LocationService.swift        # CoreLocation wrapper with background tracking plumbing
    │   └── MockData.swift               # Curated Iași stops & bookings with real coordinates
    ├── Views/
    │   ├── RootView.swift               # Role switcher container
    │   ├── RolePickerBar.swift          # Dev toolbar to switch Driver / Owner / Customer
    │   ├── DevSettingsSheet.swift       # API URL editor (localhost / norgelis.ro) & test tools
    │   ├── Driver/
    │   │   ├── DriverRootView.swift     # Driver screen wrapper
    │   │   ├── DriverMapView.swift      # MapKit view with Iași stops & "Plec spre client" CTA
    │   │   ├── StopDetailSheet.swift    # Customer address, phone & stop details
    │   │   └── StopsListView.swift      # Ordered daily stops checklist
    │   ├── Owner/
    │   │   ├── OwnerRootView.swift      # Workshop dashboard (stats, radar, bookings list)
    │   │   ├── OwnerBookingDetailView.swift # Status change sheet & customer info
    │   │   └── DriverRadarCard.swift    # Live driver status card
    │   └── Customer/
    │       ├── CustomerRootView.swift   # Code lookup (NT-XXXX) & repair timeline
    │       └── LiveTrackingView.swift   # Real-time driver approach map & ETA countdown
    └── Resources/
        ├── Info.plist                   # Permissions & background capabilities
        ├── ro.lproj/Localizable.strings # Romanian translations (primary)
        ├── en.lproj/Localizable.strings # English translations
        └── Assets.xcassets/             # App icons & AccentColor
```

---

## 5. Location Permission & Capability Plumbing

The app includes all required permissions and capability declarations for live driver tracking:

### Info.plist Permissions (Romanian)
- `NSLocationWhenInUseUsageDescription`:
  > *"Norgelis Tech folosește locația pentru navigație și pentru a indica poziția pe hartă în timpul preluărilor și livrărilor."*
- `NSLocationAlwaysAndWhenInUseUsageDescription`:
  > *"Norgelis Tech necesită acces continuu la locație în fundal pentru a transmite în timp real poziția șoferului și estimarea sosirii către atelier și client în timpul cursei."*

### Background Location Capability
Declared in `Info.plist` and `project.yml`:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>location</string>
</array>
```
In `LocationService.swift`, the manager is plumbed for background updates:
```swift
locationManager.allowsBackgroundLocationUpdates = true
locationManager.showsBackgroundLocationIndicator = true
locationManager.pausesLocationUpdatesAutomatically = false
```

---

## 6. Architecture for Later Phases (Live Driver Tracking)

In subsequent phases, the driver will share live location with the API, and both the Owner and Customer will observe the driver's progress in real time.

```
┌──────────────────┐
│   Driver App     │
│  (CLLocation)    │
└────────┬─────────┘
         │ 1. POST /api/driver/location (every 5-10s while en route)
         ▼
┌──────────────────┐
│   Express API    │
│  (site/server)   │
└────────┬─────────┘
         │ 2. Real-time broadcast (SSE) or polling
         ├────────────────────────────────┐
         ▼                                ▼
┌──────────────────┐            ┌──────────────────┐
│   Customer App   │            │  Owner Dashboard │
│ (Live ETA & Map) │            │  (Live Radar)    │
└──────────────────┘            └──────────────────┘
```

### Proposed Backend Endpoints (To Be Added in Server Phase)

#### 1. `POST /api/driver/location`
- **Caller:** Driver app while `isDriverEnRoute == true`.
- **Headers:** `Authorization: Bearer <driverToken>` or session cookie.
- **Request Body:**
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
- **Behavior:**
  - Validates coordinates within Romania bounding box.
  - Updates in-memory/Redis cache with a 60-second TTL.
  - Recomputes ETA to customer stop using OSRM or Haversine fallback.
  - Emits event to active SSE streams.

#### 2. `GET /api/bookings/:code/driver`
- **Caller:** Customer app tracking their specific booking.
- **Response:**
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

#### 3. `GET /api/admin/driver/live`
- **Caller:** Owner dashboard (iOS app and `/admin` web).
- **Response:**
  ```json
  {
    "drivers": [
      {
        "driverId": "driver-01",
        "name": "Alexandru",
        "currentBookingCode": "NT-4K7Q",
        "latitude": 47.1625,
        "longitude": 27.5750,
        "etaMinutes": 11,
        "status": "en_route"
      }
    ]
  }
  ```

#### 4. Server-Sent Events (SSE) Stream: `GET /api/driver/stream?code=NT-4K7Q`
- For low-latency updates without aggressive client polling:
  - Event: `driver_position` `{ "lat": 47.1625, "lon": 27.5750, "eta": 11 }`
  - Event: `driver_arrived` `{ "code": "NT-4K7Q" }`

### Battery & Background Best Practices for the Driver App
1. **Dynamic Frequency:** Update every 5 seconds when moving (>15 km/h), drop to every 30 seconds when stationary at a traffic light.
2. **Stop Boundary Geofencing:** Register a `CLCircularRegion` (radius 100m) around the customer address; automatically notify the driver and customer when entering the stop area.
3. **Automatic Sleep:** Stop background location updates as soon as the driver marks the stop as complete or returns to the workshop.
