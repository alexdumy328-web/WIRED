import ActivityKit
import Foundation
import UIKit
import UserNotifications

/// Push notifications and the "driver on the way" Live Activity.
///
/// - A signed-in customer's phone registers its push token, plus the Live Activity push-to-start token, so the
///   server can tell it about a new status and start the Live Activity when the driver sets off.
/// - A Live Activity that runs (started by the server, or by the app while it shows the driver) sends its own
///   token to the server, which updates and ends it.
/// - Without APNs keys on the server nothing arrives, and the app still starts and updates the Live Activity
///   itself while it is open (from the same polling that draws the map).
@MainActor
final class PushService: NSObject, ObservableObject {
    static let shared = PushService()

    /// A booking to open: a tapped notification or Live Activity, or a booking link (Universal Link).
    @Published var openCode: String?
    /// Current notification permission, kept up to date so screens can offer a pre-prompt or Settings shortcut.
    @Published private(set) var authStatus: UNAuthorizationStatus = .notDetermined

    private let api: APIClient
    private var deviceToken: String?
    private var startToken: String?
    /// The account the tokens were last sent for, so a new sign-in sends them again.
    private var registeredFor: String?
    private var signedInUser: String?
    private var watching = false
    private var uploadedActivityTokens: Set<String> = []

    init(api: APIClient = .shared) {
        self.api = api
    }

    /// Which APNs host the token belongs to. TestFlight and App Store builds are production.
    static var apnsEnvironment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    // MARK: - Launch

    /// Called at launch, also when the system wakes the app for a push-to-start Live Activity.
    func start() {
        UNUserNotificationCenter.current().delegate = self
        guard !watching else { return }
        watching = true
        Task { await watchStartToken() }
        Task { await watchActivities() }
    }

    private func watchStartToken() async {
        for await data in Activity<DriverActivityAttributes>.pushToStartTokenUpdates {
            startToken = data.hex
            await uploadDevice()
        }
    }

    private func watchActivities() async {
        // Activities that were already running when the app launched, then every new one.
        for activity in Activity<DriverActivityAttributes>.activities { observe(activity) }
        for await activity in Activity<DriverActivityAttributes>.activityUpdates { observe(activity) }
    }

    private func observe(_ activity: Activity<DriverActivityAttributes>) {
        let code = activity.attributes.code
        Task {
            for await data in activity.pushTokenUpdates {
                let token = data.hex
                guard !uploadedActivityTokens.contains(token) else { continue }
                do {
                    try await api.requestVoid("POST", "api/bookings/\(code)/activity", body: ["token": token, "env": Self.apnsEnvironment])
                    uploadedActivityTokens.insert(token)
                } catch {
                    // The app polls while it is open, so a missed token only costs background updates.
                }
            }
        }
    }

    // MARK: - Account

    /// A customer signed in (or the app opened with a session). Registers when notifications are already allowed;
    /// asking is left to the in-app pre-prompt or Account settings, so the system prompt never fires cold.
    func signedIn(userId: String) {
        signedInUser = userId
        Task {
            await refreshStatus()
            switch authStatus {
            case .authorized, .provisional, .ephemeral:
                UIApplication.shared.registerForRemoteNotifications()
                await uploadDevice()
            default:
                break
            }
        }
    }

    func refreshStatus() async {
        authStatus = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// Triggered only when the customer explicitly taps "Turn on alerts" in the pre-prompt or Account screen.
    func requestAlerts() async {
        let center = UNUserNotificationCenter.current()
        let current = await center.notificationSettings().authorizationStatus
        authStatus = current
        guard current == .notDetermined else { return }
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        await refreshStatus()
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
            await uploadDevice()
        }
    }

    /// Kept for compatibility; callers now prefer showing an inline pre-prompt before calling `requestAlerts()`.
    func askIfUseful() {
        Task { await refreshStatus() }
    }

    /// Before the session ends: this phone stops getting the account's alerts, and any Live Activity goes.
    func signingOut() async {
        if let token = deviceToken, registeredFor != nil {
            try? await api.requestVoid("DELETE", "api/push/device", body: ["token": token])
        }
        registeredFor = nil
        signedInUser = nil
        await endAll()
    }

    func didRegister(deviceToken data: Data) {
        deviceToken = data.hex
        Task { await uploadDevice() }
    }

    private func uploadDevice() async {
        guard let user = signedInUser, let token = deviceToken else { return }
        var body: [String: Any] = ["token": token, "env": Self.apnsEnvironment]
        body["startToken"] = startToken ?? NSNull()
        do {
            try await api.requestVoid("POST", "api/push/device", body: body)
            registeredFor = user
        } catch {
            registeredFor = nil
        }
    }

    // MARK: - Live Activity from the app

    /// The app sees the driver heading to this booking: show it on the lock screen and keep it current.
    /// The server's pushes take over when the app is in the background.
    func showDriver(code: String, device: String, status: DriverTrackingStatus) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let phase: DriverActivityAttributes.ContentState.Phase =
            status.arrived == true ? .arrived : ((status.etaMinutes ?? 99) <= 2 ? .arriving : .onTheWay)
        let state = DriverActivityAttributes.ContentState(
            driverName: status.driverName ?? "",
            etaMinutes: status.arrived == true ? nil : status.etaMinutes,
            phase: phase,
            updatedAt: Date().timeIntervalSince1970
        )
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(180))
        if let running = Activity<DriverActivityAttributes>.activities.first(where: { $0.attributes.code == code && $0.activityState == .active }) {
            guard running.content.state.etaMinutes != state.etaMinutes || running.content.state.phase != state.phase
                    || state.updatedAt - running.content.state.updatedAt > 30 else { return }
            Task { await running.update(content) }
            return
        }
        let attributes = DriverActivityAttributes(code: code, device: device, startedAt: Date().timeIntervalSince1970)
        do {
            _ = try Activity.request(attributes: attributes, content: content, pushType: .token)
        } catch {
            // A build without the push entitlement (Debug, a free team) cannot take server updates: run it locally,
            // updated by the app while it is open. Live Activities off, or too many running: the in-app card stays.
            _ = try? Activity.request(attributes: attributes, content: content, pushType: nil)
        }
    }

    /// The driver is no longer heading to this booking.
    func driverGone(code: String) {
        for activity in Activity<DriverActivityAttributes>.activities where activity.attributes.code == code && activity.activityState == .active {
            let state = DriverActivityAttributes.ContentState(driverName: "", etaMinutes: nil, phase: .ended, updatedAt: Date().timeIntervalSince1970)
            Task { await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .after(Date().addingTimeInterval(60))) }
        }
    }

    private func endAll() async {
        for activity in Activity<DriverActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }

    // MARK: - Links

    /// Booking links: https://<site>/?cod=NT-4K7Q (emails, Universal Links) and norgelis://booking/NT-4K7Q (Live Activity).
    static func bookingCode(from url: URL) -> String? {
        let raw: String?
        if url.scheme == "norgelis" {
            raw = url.host == "booking" ? url.pathComponents.dropFirst().first : nil
        } else {
            raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "cod" })?.value
        }
        guard let code = raw?.trimmingCharacters(in: .whitespaces).uppercased(),
              code.range(of: "^NT-[A-Z0-9]{4}$", options: .regularExpression) != nil else { return nil }
        return code
    }

    func open(_ url: URL) {
        if let code = Self.bookingCode(from: url) { openCode = code }
    }
}

extension PushService: UNUserNotificationCenterDelegate {
    /// Show alerts while the app is open too (a status change while the customer looks at the list).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let code = response.notification.request.content.userInfo["code"] as? String
        await MainActor.run {
            if let code { self.openCode = code.uppercased() }
        }
    }
}

/// The app delegate exists for the push token callbacks only.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        MainActor.assumeIsolated { PushService.shared.start() }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { PushService.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // No push entitlement (a free development team) or no network: the app works without push.
    }
}

private extension Data {
    var hex: String { map { String(format: "%02x", $0) }.joined() }
}
