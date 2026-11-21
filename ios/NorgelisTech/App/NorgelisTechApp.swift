import SwiftUI

@main
struct NorgelisTechApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var locationService = LocationService.shared
    @StateObject private var apiClient = APIClient.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(locationService)
                .environmentObject(apiClient)
        }
    }
}
