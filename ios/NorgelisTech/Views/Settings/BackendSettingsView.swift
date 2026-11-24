import SwiftUI

/// Server address and sample data. Only owners and devs reach this screen (More tab).
struct BackendSettingsView: View {
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var locationService: LocationService
    @Environment(\.openURL) private var openURL

    @State private var address = ""
    @State private var testing = false
    @State private var result: (ok: Bool, message: String)?
    @State private var tested: String?
    @State private var confirmApply = false

    /// One session for every health check, with no cookies: it must not carry the account to an address being tried.
    private static let probeSession = URLSession(configuration: .ephemeral)

    private var trimmed: String { address.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/")) }
    private var changed: Bool { trimmed != apiClient.baseURLString }
    private var valid: Bool { Self.isAllowed(trimmed) }

    /// Release builds only talk to HTTPS servers. Debug builds also accept plain HTTP for a local server.
    static func isAllowed(_ address: String, allowHTTP: Bool = APIClient.isDebugBuild) -> Bool {
        APIClient.isAllowedServer(address, allowHTTP: allowHTTP)
    }

    var body: some View {
        Form {
            Section {
                TextField("https://", text: $address)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .submitLabel(.done)
                // An address is applied only after it answered the health check, so a typo cannot lock everyone out.
                Button("backend.apply") { confirmApply = true }
                    .disabled(!changed || !valid || tested != trimmed)
                Button {
                    Task { await test() }
                } label: {
                    HStack {
                        if testing { ProgressView().padding(.trailing, 4) } else { Image(systemName: "network") }
                        Text("settings.health.test")
                    }
                }
                .disabled(testing || !valid)
                if let result {
                    Label(result.message, systemImage: result.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundColor(result.ok ? Theme.ok : Theme.danger)
                }
            } header: { Text("settings.api_base_url") } footer: {
                if !trimmed.isEmpty, !valid { Text("backend.https_only").foregroundColor(Theme.danger) } else { Text("backend.footer") }
            }

            Section("dev.gps.title") {
                LabeledContent("dev.gps.status") { Text(locationText).foregroundColor(.secondary) }
                if locationService.authorizationStatus == .notDetermined {
                    Button("dev.gps.request") { locationService.requestWhenInUsePermission() }
                } else if locationService.authorizationStatus == .denied || locationService.authorizationStatus == .restricted {
                    Button("backend.open_settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    }
                }
            }
        }
        .navigationTitle(LocalizedStringKey("console.more.dev_settings"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { address = apiClient.baseURLString }
        .confirmationDialog("backend.apply.title", isPresented: $confirmApply, titleVisibility: .visible) {
            Button("backend.apply.confirm", role: .destructive) {
                apiClient.baseURLString = trimmed
                result = nil
                tested = nil
            }
            Button("common.cancel", role: .cancel) {}
        } message: {
            Text("backend.apply.message")
        }
    }

    private var locationText: String {
        switch locationService.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: return String(localized: "backend.location.allowed")
        case .denied: return String(localized: "dev.gps.denied")
        case .restricted: return String(localized: "dev.gps.restricted")
        case .notDetermined: return String(localized: "dev.gps.not_asked")
        @unknown default: return String(localized: "dev.gps.unknown")
        }
    }

    /// Asks the typed address, not the saved one, so a wrong address is caught before it is applied.
    private func test() async {
        testing = true
        result = nil
        defer { testing = false }
        guard let url = URL(string: trimmed)?.appendingPathComponent("api/health") else { return }
        do {
            // No cookies: this call must not carry the session to an address that is only being tried.
            let (data, response) = try await Self.probeSession.data(from: url)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let health = try? JSONDecoder().decode(HealthResponse.self, from: data), health.ok else {
                result = (false, String(localized: "backend.test.bad_answer"))
                return
            }
            tested = trimmed
            result = (true, String(format: String(localized: "dev.health.ok %@"), health.store ?? String(localized: "dev.gps.unknown")))
        } catch {
            result = (false, error.localizedDescription)
        }
    }
}
