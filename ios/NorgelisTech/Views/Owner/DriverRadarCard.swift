import SwiftUI
import CoreLocation

/// Polls the drivers who are sharing right now, every 10 seconds while the Today tab is open.
@MainActor
final class DriverRadarModel: ObservableObject {
    @Published private(set) var drivers: [LiveDriver] = []
    @Published private(set) var idle: [IdleDriver] = []
    @Published private(set) var failed = false
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    /// Set by the card from the scene phase: nothing is fetched while the app is in the background.
    var active = true

    func run() async {
        var failures = 0
        while !Task.isCancelled {
            if !active {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                continue
            }
            do {
                let next = try await api.fetchLiveDrivers()
                if next.drivers != drivers { drivers = next.drivers }
                if (next.idle ?? []) != idle { idle = next.idle ?? [] }
                if failed { failed = false }
                failures = 0
            } catch is CancellationError {
                return
            } catch {
                failed = true
                failures += 1
            }
            try? await Task.sleep(nanoseconds: UInt64(min(60, 10 * (1 << min(failures, 2)))) * 1_000_000_000)
        }
    }
}

/// Where the driver is: live from the server, or the phone's own simulation for a demo account.
struct DriverRadarCard: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var apiClient: APIClient
    @StateObject private var model = DriverRadarModel(api: APIClient.shared)
    @Environment(\.scenePhase) private var scenePhase

    private var live: LiveDriver? { model.drivers.first }
    private var moving: Bool { apiClient.useMockData ? appState.isDriverEnRoute : live != nil }
    /// "At the workshop" only when the last trip ended within 200 m of it (or in demo mode, where it is the story).
    private var lastStop: IdleDriver? { model.idle.first }
    private func distanceFromShop(_ d: IdleDriver) -> CLLocationDistance {
        CLLocation(latitude: d.latitude, longitude: d.longitude).distance(from: CLLocation(latitude: Shop.coordinate.latitude, longitude: Shop.coordinate.longitude))
    }
    private var atShop: Bool { apiClient.useMockData ? !appState.isDriverEnRoute : lastStop.map { distanceFromShop($0) < 200 } ?? false }
    private var stateKey: String { moving ? "radar.moving" : atShop ? "radar.at_shop" : "radar.no_trip" }
    private var eta: Int? { apiClient.useMockData ? (appState.isDriverEnRoute ? appState.etaMinutes : nil) : live?.etaMinutes }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Circle()
                        .fill(moving ? Theme.ok : atShop ? Theme.shop : Color.secondary)
                        .frame(width: 10, height: 10)
                        .overlay(
                            Circle()
                                .stroke(moving ? Theme.ok.opacity(0.4) : Color.clear, lineWidth: 6)
                                .scaleEffect(moving ? 1.5 : 1.0)
                        )
                    Text(LocalizedStringKey(stateKey))
                        .font(.caption.bold())
                        .foregroundColor(moving ? Theme.ok : atShop ? Theme.shop : .secondary)
                }
                Spacer()
                if let eta {
                    Text("~\(eta) min")
                        .font(.subheadline.bold())
                        .foregroundColor(Theme.pickup)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Theme.pickup.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
            detail
        }
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .task { if !apiClient.useMockData { await model.run() } }
        .onChange(of: scenePhase) { _, phase in model.active = phase == .active }
    }

    @ViewBuilder
    private var detail: some View {
        if apiClient.useMockData, appState.isDriverEnRoute, let stop = appState.currentEnRouteStop {
            VStack(alignment: .leading, spacing: 4) {
                Text("radar.destination \(stop.address)").font(.headline).lineLimit(1)
                Text("radar.client \(stop.customerName) \(stop.bookingCode)").font(.caption).foregroundColor(.secondary)
            }
        } else if !apiClient.useMockData, !model.drivers.isEmpty {
            // Everyone sharing, not just the first: the van must not hide behind a technician.
            VStack(alignment: .leading, spacing: 6) {
                ForEach(model.drivers) { d in
                    HStack {
                        Text(d.name).font(.headline).lineLimit(1)
                        if let code = d.bookingCode { Text("radar.heading_to \(code)").font(.caption).foregroundColor(.secondary) }
                        Spacer()
                        if let eta = d.etaMinutes { Text("~\(eta) min").font(.caption.bold()).foregroundColor(Theme.pickup) }
                    }
                }
            }
        } else if model.failed && !apiClient.useMockData {
            Text("radar.unavailable").font(.subheadline).foregroundColor(.secondary)
        } else if !apiClient.useMockData, let d = lastStop {
            // Not on a trip: where the last one ended, measured, not assumed.
            let km = String(format: "%.1f", distanceFromShop(d) / 1000)
            let time = ShopCalendar.parse(d.lastSeen).map(ShopCalendar.clock) ?? ""
            // Two literal Texts: interpolating into a finished string would look up the sentence itself as the key.
            Group {
                if atShop { Text("radar.last_at_shop \(d.name) \(time)") } else { Text("radar.last_seen \(d.name) \(time) \(km)") }
            }
            .font(.subheadline).foregroundColor(.secondary)
        } else if apiClient.useMockData {
            Text("radar.waiting").font(.subheadline).foregroundColor(.secondary)
        } else {
            Text("radar.no_trip_detail").font(.subheadline).foregroundColor(.secondary)
        }
    }
}
