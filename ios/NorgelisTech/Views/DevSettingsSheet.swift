import SwiftUI

struct DevSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var locationService: LocationService

    @State private var apiStatusMessage: String?
    @State private var isTestingConnection: Bool = false
    @State private var isSuccess: Bool = false

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text(LocalizedStringKey("settings.api_base_url"))) {
                    TextField("http://localhost:8787", text: $apiClient.baseURLString)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        #endif

                    HStack {
                        Button(LocalizedStringKey("settings.preset.localhost")) {
                            apiClient.baseURLString = "http://localhost:8787"
                        }
                        .buttonStyle(.bordered)
                        .font(.caption)

                        Button(LocalizedStringKey("settings.preset.production")) {
                            apiClient.baseURLString = "https://norgelis.ro"
                        }
                        .buttonStyle(.bordered)
                        .font(.caption)
                    }

                    Button {
                        testApiHealth()
                    } label: {
                        HStack {
                            if isTestingConnection {
                                ProgressView()
                                    .padding(.trailing, 4)
                            } else {
                                Image(systemName: "network")
                            }
                            Text(LocalizedStringKey("settings.health.test"))
                        }
                    }
                    .disabled(isTestingConnection)

                    if let message = apiStatusMessage {
                        HStack {
                            Image(systemName: isSuccess ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .foregroundColor(isSuccess ? .green : .red)
                            Text(message)
                                .font(.footnote)
                        }
                    }
                }

                Section(header: Text("console.dev.title")) {
                    Toggle("console.more.sample_data", isOn: $apiClient.useMockData)
                }

                Section(header: Text("dev.gps.title")) {
                    HStack {
                        Text("dev.gps.status")
                        Spacer()
                        Text(authStatusText)
                            .foregroundColor(.secondary)
                    }

                    if locationService.authorizationStatus == .notDetermined {
                        Button("dev.gps.request") {
                            locationService.requestWhenInUsePermission()
                        }
                    }

                    Toggle("dev.gps.background", isOn: .constant(true))
                        .disabled(true)
                    Text("dev.gps.background_note")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Section(header: Text("dev.mock.title")) {
                    Button(role: .destructive) {
                        appState.resetDriverDemo()
                    } label: {
                        Label("dev.mock.reset", systemImage: "arrow.counterclockwise")
                    }
                }
            }
            .navigationTitle(LocalizedStringKey("settings.title"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(LocalizedStringKey("common.close")) {
                        dismiss()
                    }
                }
            }
        }
    }

    private var authStatusText: String {
        switch locationService.authorizationStatus {
        case .authorizedAlways: return "Always"
        case .authorizedWhenInUse: return "When In Use"
        case .denied: return String(localized: "dev.gps.denied")
        case .restricted: return String(localized: "dev.gps.restricted")
        case .notDetermined: return String(localized: "dev.gps.not_asked")
        @unknown default: return String(localized: "dev.gps.unknown")
        }
    }

    private func testApiHealth() {
        isTestingConnection = true
        apiStatusMessage = nil

        Task {
            do {
                let health = try await apiClient.checkHealth()
                await MainActor.run {
                    isTestingConnection = false
                    isSuccess = true
                    apiStatusMessage = String(format: String(localized: "dev.health.ok %@"), health.store ?? String(localized: "dev.gps.unknown"))
                }
            } catch {
                await MainActor.run {
                    isTestingConnection = false
                    isSuccess = false
                    apiStatusMessage = error.localizedDescription
                }
            }
        }
    }
}
