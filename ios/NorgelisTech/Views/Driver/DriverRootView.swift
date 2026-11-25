import SwiftUI

/// The driver's day. Stops come from today's pickups on the server (or the sample list).
struct DriverRootView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var apiClient: APIClient
    /// Back to the previous tab: the map's sheet covers the tab bar.
    var onClose: (() -> Void)?

    var body: some View {
        DriverMapView(planner: appState.planner, onClose: onClose)
            .overlay(alignment: .top) { notice }
    }

    @ViewBuilder
    private var notice: some View {
        if let error = appState.stopsError {
            ErrorBanner(message: error) { Task { await appState.loadStops() } }
                .padding(12)
        } else if appState.stopsLoading && appState.stops.isEmpty {
            ProgressView().padding(10).glassCard(radius: 16).padding(.top, 12)
        } else if appState.stops.isEmpty && !apiClient.useMockData {
            Text("driver.empty_today")
                .font(.subheadline.bold())
                .padding(.horizontal, 14).padding(.vertical, 10)
                .glassCard(radius: 16)
                .padding(.top, 12)
        }
    }
}
