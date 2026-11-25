import SwiftUI

@main
struct NorgelisTechApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var push = PushService.shared
    @StateObject private var remoteConfig = RemoteConfig.shared
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
                .environmentObject(push)
                .environmentObject(remoteConfig)
                .task { await authStore.refresh() }
                .task { await remoteConfig.refresh() }
                // Booking links from the emails (Universal Links) and taps on the Live Activity.
                .onOpenURL { push.open($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { push.open(url) }
                }
                // Back in the app: check the session again, so an offline start recovers by itself.
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active, authStore.loaded { Task { await authStore.refresh() } }
                }
                // Another person signed in, or nobody: forget the last one's trip, stops, lookups and access.
                .onChange(of: authStore.viewer?.id) { _, _ in
                    appState.resetSession()
                    ownerStore.reset()
                    // Customers get status alerts and the driver Live Activity. Staff and demo accounts do not.
                    if let viewer = authStore.viewer, !viewer.isStaff, !viewer.isDemo { push.signedIn(userId: viewer.id) }
                }
        }
    }
}
