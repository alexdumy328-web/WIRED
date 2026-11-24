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
    @State private var confirmApply = false
    @State private var confirmSample = false

    private var trimmed: String { address.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/")) }
    private var changed: Bool { trimmed != apiClient.baseURLString }
    private var valid: Bool { Self.isAllowed(trimmed) }

    /// Release builds only talk to HTTPS servers. Debug builds also accept plain HTTP for a local server.
    static func isAllowed(_ address: String) -> Bool {
        guard let url = URL(string: address), let scheme = url.scheme?.lowercased(), url.host != nil else { return false }
        #if DEBUG
        return scheme == "https" || scheme == "http"
        #else
        return scheme == "https"
        #endif
    }

    var body: some View {
        Form {
            Section {
                TextField("https://", text: $address)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .submitLabel(.done)
                Button("backend.apply") { confirmApply = true }
                    .disabled(!changed || !valid)
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

            Section {
                Toggle("console.more.sample_data", isOn: Binding(
                    get: { apiClient.useMockData },
                    set: { on in if on { confirmSample = true } else { apiClient.useMockData = false } }
                ))
                Text(LocalizedStringKey(apiClient.useMockData ? "console.more.sample_on" : "console.more.sample_off"))
                    .font(.footnote).foregroundColor(.secondary)
                if apiClient.useMockData {
                    Button(role: .destructive) { appState.resetDriverDemo() } label: { Label("dev.mock.reset", systemImage: "arrow.counterclockwise") }
                }
            } header: { Text("console.dev.title") }

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
            }
            Button("common.cancel", role: .cancel) {}
        } message: {
            Text("backend.apply.message")
        }
        .confirmationDialog("backend.sample.title", isPresented: $confirmSample, titleVisibility: .visible) {
            Button("backend.sample.confirm") { apiClient.useMockData = true }
            Button("common.cancel", role: .cancel) {}
        } message: {
            Text("backend.sample.message")
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
            let (data, response) = try await URLSession.shared.data(from: url)
            guard (response as? HTTPURLResponse)?.statusCode == 200,
                  let health = try? JSONDecoder().decode(HealthResponse.self, from: data), health.ok else {
                result = (false, String(localized: "backend.test.bad_answer"))
                return
            }
            result = (true, String(format: String(localized: "dev.health.ok %@"), health.store ?? String(localized: "dev.gps.unknown")))
        } catch {
            result = (false, error.localizedDescription)
        }
    }
}
