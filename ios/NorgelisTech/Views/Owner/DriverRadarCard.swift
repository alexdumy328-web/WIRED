import SwiftUI

/// Polls the drivers who are sharing right now, every 10 seconds while the Today tab is open.
@MainActor
final class DriverRadarModel: ObservableObject {
    @Published private(set) var drivers: [LiveDriver] = []
    @Published private(set) var failed = false
    private let api: APIClient

    init(api: APIClient) { self.api = api }

    func run() async {
        var failures = 0
        while !Task.isCancelled {
            do {
                drivers = try await api.fetchLiveDrivers()
                failed = false
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

    private var live: LiveDriver? { model.drivers.first }
    private var moving: Bool { apiClient.useMockData ? appState.isDriverEnRoute : live != nil }
    private var eta: Int? { apiClient.useMockData ? (appState.isDriverEnRoute ? appState.etaMinutes : nil) : live?.etaMinutes }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Circle()
                        .fill(moving ? Theme.ok : Theme.shop)
                        .frame(width: 10, height: 10)
                        .overlay(
                            Circle()
                                .stroke(moving ? Theme.ok.opacity(0.4) : Color.clear, lineWidth: 6)
                                .scaleEffect(moving ? 1.5 : 1.0)
                        )
                    Text(LocalizedStringKey(moving ? "radar.moving" : "radar.at_shop"))
                        .font(.caption.bold())
                        .foregroundColor(moving ? Theme.ok : Theme.shop)
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
    }

    @ViewBuilder
    private var detail: some View {
        if apiClient.useMockData, appState.isDriverEnRoute, let stop = appState.currentEnRouteStop {
            VStack(alignment: .leading, spacing: 4) {
                Text("radar.destination \(stop.address)").font(.headline).lineLimit(1)
                Text("radar.client \(stop.customerName) \(stop.bookingCode)").font(.caption).foregroundColor(.secondary)
            }
        } else if !apiClient.useMockData, let live {
            VStack(alignment: .leading, spacing: 4) {
                Text(live.name).font(.headline).lineLimit(1)
                if let code = live.bookingCode {
                    Text("radar.heading_to \(code)").font(.caption).foregroundColor(.secondary)
                }
            }
        } else if model.failed && !apiClient.useMockData {
            Text("radar.unavailable").font(.subheadline).foregroundColor(.secondary)
        } else {
            Text("radar.waiting").font(.subheadline).foregroundColor(.secondary)
        }
    }
}
