import SwiftUI

struct DriverRootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        DriverMapView(planner: appState.planner)
    }
}
