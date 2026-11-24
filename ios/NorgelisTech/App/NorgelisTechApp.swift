import SwiftUI

@main
struct NorgelisTechApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var locationService = LocationService.shared
    @StateObject private var apiClient = APIClient.shared
    @StateObject private var ownerStore = OwnerStore(api: APIClient.shared)
    @StateObject private var authStore = AuthStore(api: APIClient.shared)
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appState)
                .environmentObject(locationService)
                .environmentObject(apiClient)
                .environmentObject(ownerStore)
                .environmentObject(authStore)
                .task { await authStore.refresh() }
                // Back in the app: check the session again, so an offline start recovers by itself.
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active, authStore.loaded { Task { await authStore.refresh() } }
                }
                // Another person signed in, or nobody: forget the last one's trip, stops, lookups and access.
                .onChange(of: authStore.viewer?.id) { old, _ in
                    // The first sign-in check after launch (nil to the saved account) keeps today's done stops.
                    appState.resetSession(clearSavedDone: old != nil)
                    ownerStore.reset()
                }
        }
    }
}
