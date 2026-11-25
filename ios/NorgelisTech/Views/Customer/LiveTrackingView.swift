import SwiftUI
import MapKit

/// Polls the server for the driver heading to one booking. Slower when the driver is far away or not sharing,
/// faster when close, and it stops as soon as the view goes away.
@MainActor
final class DriverTrackingModel: ObservableObject {
    @Published private(set) var status: DriverTrackingStatus = .idle
    @Published private(set) var connectionLost = false
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func run(code: String, device: String = "") async {
        var failures = 0
        while !Task.isCancelled {
            do {
                let next = try await api.fetchDriver(code: code)
                // The lock screen follows what the app sees (the server's pushes take over in the background).
                if next.isEnRoute { PushService.shared.showDriver(code: code, device: device, status: next) }
                else if status.isEnRoute { PushService.shared.driverGone(code: code) }
                // Same answer as last time (the van parked, nobody sharing): no redraw.
                if next != status { status = next }
                failures = 0
                if connectionLost { connectionLost = false }
            } catch is CancellationError {
                return
            } catch {
                failures += 1
                if status.isEnRoute && !connectionLost { connectionLost = true }
            }
            // 5 s when the driver is close, 10 s on the way, 45 s when nobody is sharing, and backing off on errors.
            var seconds: UInt64 = status.isEnRoute ? ((status.etaMinutes ?? 99) <= 10 ? 5 : 10) : 45
            if failures > 0 { seconds = min(60, seconds * UInt64(1 << min(failures, 3))) }
            try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
        }
    }
}

/// The "driver is on the way" card for a booking. Real positions from the server. A demo account uses the
/// driver simulation on the phone instead, so the card still moves without a real trip. When the driver is
/// not en route yet, renders the scheduled pickup row (when passed as `fallback`) so the two never stack.
struct DriverOnTheWay: View {
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var appState: AppState
    @StateObject private var model: DriverTrackingModel
    let code: String
    /// Where the customer is, when the booking says so (a guest lookup does not).
    var destination: CLLocationCoordinate2D?
    /// Shown on the Live Activity, for example "Apple iPhone 13".
    var device: String
    /// Customer's street address, shown under the live map headline.
    var address: String?
    /// Shown as a compact scheduled pickup row while the driver is not yet en route.
    var fallback: Booking?

    init(code: String, destination: CLLocationCoordinate2D?, device: String = "", address: String? = nil, fallback: Booking? = nil) {
        self.code = code
        self.destination = destination
        self.device = device
        self.address = address
        self.fallback = fallback
        _model = StateObject(wrappedValue: DriverTrackingModel(api: APIClient.shared))
    }

    var body: some View {
        Group {
            if apiClient.useMockData {
                if appState.isDriverEnRoute, let stop = appState.currentEnRouteStop, stop.bookingCode == code {
                    LiveDriverCard(
                        name: nil,
                        driver: appState.driverCoordinate,
                        eta: appState.etaMinutes,
                        destination: stop.coordinate,
                        address: stop.address,
                        arrived: appState.hasArrived,
                        updatedAt: nil,
                        connectionLost: false
                    )
                } else if let fallback {
                    PickupContactRow(booking: fallback)
                }
            } else if model.status.isEnRoute, let lat = model.status.latitude, let lon = model.status.longitude {
                LiveDriverCard(
                    name: model.status.driverName,
                    driver: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                    eta: model.status.etaMinutes,
                    destination: destination,
                    address: address,
                    arrived: model.status.arrived == true,
                    updatedAt: model.status.updatedAt,
                    connectionLost: model.connectionLost
                )
            } else if let fallback {
                PickupContactRow(booking: fallback)
            } else {
                // An empty Group has no lifecycle, so `.task` would never start polling. A zero-height anchor
                // keeps it alive; the negative padding gives back the parent stack's spacing.
                Color.clear.frame(height: 0).padding(.bottom, -20).accessibilityHidden(true)
            }
        }
        .task(id: code) {
            if !apiClient.useMockData { await model.run(code: code, device: device) }
        }
    }
}

private struct CoordKey: Equatable {
    let lat: Double
    let lon: Double
}

struct LiveDriverCard: View {
    let name: String?
    let driver: CLLocationCoordinate2D
    let eta: Int?
    let destination: CLLocationCoordinate2D?
    let address: String?
    var arrived: Bool = false
    var updatedAt: String? = nil
    var connectionLost: Bool = false

    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var userMovedMap = false
    @State private var programmaticMove = false

    /// First name only, filtering out generic server fallbacks like "Șofer" or "Driver".
    private var driverFirstName: String? {
        guard let raw = name?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        let generic = ["șofer", "sofer", "driver"]
        if generic.contains(raw.lowercased()) { return nil }
        return raw.split(separator: " ").first.map(String.init) ?? raw
    }

    private var coordKey: CoordKey { CoordKey(lat: driver.latitude, lon: driver.longitude) }

    var body: some View {
        VStack(spacing: 0) {
            headerBanner

            ZStack(alignment: .topTrailing) {
                Map(position: $cameraPosition) {
                    if let destination {
                        Marker(String(localized: "customer.live.your_address"), systemImage: "house.fill", coordinate: destination).tint(Theme.danger)
                    }
                    Annotation(driverFirstName ?? String(localized: "customer.live.driver"), coordinate: driver) {
                        ZStack {
                            Circle().fill(Color.blue.opacity(0.2)).frame(width: 44, height: 44)
                            Image(systemName: "car.fill").font(.system(size: 16, weight: .bold)).foregroundColor(.white)
                                .frame(width: 28, height: 28).background(Circle().fill(Color.blue))
                        }
                    }
                }
                .onMapCameraChange(frequency: .onEnd) { _ in
                    if programmaticMove {
                        programmaticMove = false
                    } else {
                        userMovedMap = true
                    }
                }
                .frame(height: 220)
                .clipShape(RoundedRectangle(cornerRadius: 16))

                if userMovedMap {
                    Button {
                        userMovedMap = false
                        recenter()
                    } label: {
                        Label("customer.live.recenter", systemImage: "location.fill")
                            .font(.caption.bold())
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .glassCard(radius: 12)
                    }
                    .buttonStyle(.plain)
                    .padding(10)
                }
            }
            .padding(16)

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    headlineText.font(.headline)
                    if arrived {
                        Text(address.map { String(format: String(localized: "customer.live.at_address %@"), $0) } ?? String(localized: "customer.live.waiting_door"))
                            .font(.subheadline).foregroundColor(.secondary)
                    } else if let address {
                        Text("customer.live.heading \(address)").font(.subheadline).foregroundColor(.secondary)
                    }
                    stalenessLine
                }
                Spacer(minLength: 8)
                CallDriverButton()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        // Follow the van on both axes until the user drags or zooms the map manually.
        .onChange(of: coordKey) { _, _ in
            if !userMovedMap { recenter() }
        }
        .onAppear { recenter() }
    }

    private var headerBanner: some View {
        HStack {
            HStack(spacing: 8) {
                Circle().fill(Theme.ok).frame(width: 10, height: 10)
                    .overlay(Circle().stroke(Theme.ok.opacity(0.3), lineWidth: 6).scaleEffect(1.4))
                    .accessibilityHidden(true)
                Text(LocalizedStringKey(arrived ? "customer.driver.arrived_badge" : "customer.driver.live_badge"))
                    .font(.caption.bold()).foregroundColor(Theme.ok)
            }
            Spacer()
            if arrived {
                Label("customer.driver.at_door_short", systemImage: "door.left.hand.open")
                    .font(.caption.bold()).foregroundColor(Theme.ok)
            } else if let eta {
                Text("customer.live.arrival \(eta)").font(.subheadline.bold()).foregroundColor(Theme.pickup)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.ok.opacity(0.12))
        .accessibilityElement(children: .combine)
    }

    private var headlineText: Text {
        if arrived {
            if let first = driverFirstName {
                return Text("customer.driver.arrived_named \(first)")
            }
            return Text("customer.driver.arrived")
        }
        if let first = driverFirstName {
            return Text("customer.driver.on_the_way_named \(first)")
        }
        return Text("customer.driver.on_the_way")
    }

    @ViewBuilder
    private var stalenessLine: some View {
        if connectionLost {
            Label("customer.live.offline", systemImage: "wifi.exclamationmark")
                .font(.caption).foregroundColor(Theme.danger)
        } else if let updatedAt, let date = ShopCalendar.parse(updatedAt) {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                let mins = Int(context.date.timeIntervalSince(date) / 60)
                if mins >= 2 {
                    Label("customer.live.stale \(mins)", systemImage: "clock.badge.exclamationmark")
                        .font(.caption).foregroundColor(Theme.shop)
                }
            }
        }
    }

    private func recenter() {
        var coords = [driver]
        if let destination { coords.append(destination) }
        let lats = coords.map(\.latitude), lons = coords.map(\.longitude)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2, longitude: (lons.min()! + lons.max()!) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max(0.01, (lats.max()! - lats.min()!) * 1.6), longitudeDelta: max(0.01, (lons.max()! - lons.min()!) * 1.6))
        programmaticMove = true
        withAnimation(.easeInOut(duration: 0.4)) { cameraPosition = .region(MKCoordinateRegion(center: center, span: span)) }
    }
}
