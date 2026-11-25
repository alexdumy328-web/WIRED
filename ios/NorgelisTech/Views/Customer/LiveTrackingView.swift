import SwiftUI
import MapKit

/// Polls the server for the driver heading to one booking. Slower when the driver is far away or not sharing,
/// faster when close, and it stops as soon as the view goes away.
@MainActor
final class DriverTrackingModel: ObservableObject {
    @Published private(set) var status: DriverTrackingStatus = .idle
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
            } catch is CancellationError {
                return
            } catch {
                failures += 1
            }
            // 5 s when the driver is close, 10 s on the way, 45 s when nobody is sharing, and backing off on errors.
            var seconds: UInt64 = status.isEnRoute ? ((status.etaMinutes ?? 99) <= 10 ? 5 : 10) : 45
            if failures > 0 { seconds = min(60, seconds * UInt64(1 << min(failures, 3))) }
            try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
        }
    }
}

/// The "driver is on the way" card for a booking. Real positions from the server. A demo account uses the
/// driver simulation on the phone instead, so the card still moves without a real trip.
struct DriverOnTheWay: View {
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var appState: AppState
    @StateObject private var model: DriverTrackingModel
    let code: String
    /// Where the customer is, when the booking says so (a guest lookup does not).
    var destination: CLLocationCoordinate2D?
    /// Shown on the Live Activity, for example "Apple iPhone 13".
    var device: String

    init(code: String, destination: CLLocationCoordinate2D?, device: String = "") {
        self.code = code
        self.destination = destination
        self.device = device
        _model = StateObject(wrappedValue: DriverTrackingModel(api: APIClient.shared))
    }

    var body: some View {
        Group {
            if apiClient.useMockData {
                if appState.isDriverEnRoute, let stop = appState.currentEnRouteStop, stop.bookingCode == code {
                    LiveDriverCard(name: nil, driver: appState.driverCoordinate, eta: appState.etaMinutes, destination: stop.coordinate, address: stop.address)
                }
            } else if model.status.isEnRoute, let lat = model.status.latitude, let lon = model.status.longitude {
                LiveDriverCard(name: model.status.driverName, driver: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                               eta: model.status.etaMinutes, destination: destination, address: nil)
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

struct LiveDriverCard: View {
    let name: String?
    let driver: CLLocationCoordinate2D
    let eta: Int?
    let destination: CLLocationCoordinate2D?
    let address: String?

    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(Theme.ok).frame(width: 10, height: 10)
                        .overlay(Circle().stroke(Theme.ok.opacity(0.3), lineWidth: 6).scaleEffect(1.4))
                    Text(LocalizedStringKey("customer.driver.live_badge")).font(.caption.bold()).foregroundColor(Theme.ok)
                }
                Spacer()
                if let eta {
                    Text("customer.live.arrival \(eta)").font(.subheadline.bold()).foregroundColor(Theme.pickup)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Theme.ok.opacity(0.12))

            Map(position: $cameraPosition) {
                if let destination {
                    Marker(String(localized: "customer.live.your_address"), systemImage: "house.fill", coordinate: destination).tint(Theme.danger)
                }
                Annotation(name ?? String(localized: "customer.live.driver"), coordinate: driver) {
                    ZStack {
                        Circle().fill(Color.blue.opacity(0.2)).frame(width: 44, height: 44)
                        Image(systemName: "car.fill").font(.system(size: 16, weight: .bold)).foregroundColor(.white)
                            .frame(width: 28, height: 28).background(Circle().fill(Color.blue))
                    }
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(16)

            VStack(alignment: .leading, spacing: 10) {
                Text(LocalizedStringKey("customer.driver.on_the_way")).font(.headline)
                if let address { Text("customer.live.heading \(address)").font(.subheadline).foregroundColor(.secondary) }
                CallDriverButton()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        // Follow the van: re-frame when it moves.
        .onChange(of: driver.latitude) { _, _ in recenter() }
        .onAppear { recenter() }
    }

    private func recenter() {
        var coords = [driver]
        if let destination { coords.append(destination) }
        let lats = coords.map(\.latitude), lons = coords.map(\.longitude)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2, longitude: (lons.min()! + lons.max()!) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max(0.01, (lats.max()! - lats.min()!) * 1.6), longitudeDelta: max(0.01, (lons.max()! - lons.min()!) * 1.6))
        withAnimation(.easeInOut(duration: 0.4)) { cameraPosition = .region(MKCoordinateRegion(center: center, span: span)) }
    }
}
