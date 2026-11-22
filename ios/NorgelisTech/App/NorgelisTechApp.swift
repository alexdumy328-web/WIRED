import SwiftUI

@main
struct NorgelisTechApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var locationService = LocationService.shared
    @StateObject private var apiClient = APIClient.shared
    @StateObject private var ownerStore = OwnerStore(api: APIClient.shared)
    @StateObject private var authStore = AuthStore(api: APIClient.shared)

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(locationService)
                .environmentObject(apiClient)
                .environmentObject(ownerStore)
                .environmentObject(authStore)
                .task { await authStore.refresh() }
        }
    }
}
