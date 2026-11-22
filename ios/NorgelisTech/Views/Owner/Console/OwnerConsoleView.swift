import SwiftUI

/// The owner area: today's overview, jobs, customers, schedule and the rest of the workshop.
struct OwnerConsoleView: View {
    @EnvironmentObject var store: OwnerStore
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var auth: AuthStore

    /// Live data needs a staff login. Sample data does not.
    private var needsLogin: Bool {
        !apiClient.useMockData && auth.viewer?.isStaff != true
    }

    var body: some View {
        if needsLogin {
            if auth.loaded {
                StaffLoginRequired()
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            console
        }
    }

    private var console: some View {
        TabView(selection: $store.tab) {
            TodayTab()
                .tabItem { Label("console.tab.today", systemImage: "sun.max.fill") }
                .tag(OwnerStore.Tab.today)
            JobsTab()
                .tabItem { Label("console.tab.jobs", systemImage: "wrench.and.screwdriver.fill") }
                .tag(OwnerStore.Tab.jobs)
            CustomersTab()
                .tabItem { Label("console.tab.customers", systemImage: "person.2.fill") }
                .tag(OwnerStore.Tab.customers)
            ScheduleTab()
                .tabItem { Label("console.tab.schedule", systemImage: "calendar") }
                .tag(OwnerStore.Tab.schedule)
            MoreTab()
                .tabItem { Label("console.tab.more", systemImage: "ellipsis.circle.fill") }
                .tag(OwnerStore.Tab.more)
        }
        .task(id: "\(apiClient.useMockData)-\(auth.viewer?.id ?? "")") { await store.bootstrap() }
    }
}

struct MoreTab: View {
    @EnvironmentObject var store: OwnerStore
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        WarrantiesView()
                    } label: {
                        HStack {
                            Label("console.warranty.title", systemImage: "checkmark.shield.fill")
                            Spacer()
                            if let n = store.counts?.warranties.expiring, n > 0 {
                                Text("\(n)").font(.caption.bold()).padding(.horizontal, 8).padding(.vertical, 2)
                                    .background(Theme.shop.opacity(0.15)).foregroundColor(Theme.shop).clipShape(Capsule())
                            }
                        }
                    }
                    if store.role.isManager {
                        NavigationLink { StatsView() } label: { Label("console.stats.title", systemImage: "chart.bar.xaxis") }
                        NavigationLink { OwnerSettingsView() } label: { Label("console.settings.title", systemImage: "slider.horizontal.3") }
                    }
                }

                Section("console.more.account") {
                    HStack {
                        Label("console.more.role", systemImage: "person.badge.key.fill")
                        Spacer()
                        Text(LocalizedStringKey(store.role.titleKey)).foregroundColor(.secondary)
                    }
                    if apiClient.useMockData {
                        Picker("console.more.preview_as", selection: Binding(get: { store.role }, set: { store.chooseMockRole($0) })) {
                            ForEach(StaffRole.allCases) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
                        }
                    }
                    if !store.role.isManager {
                        Text("console.more.technician_note").font(.footnote).foregroundColor(.secondary)
                    }
                }

                Section("console.more.data") {
                    Toggle("console.more.sample_data", isOn: $apiClient.useMockData)
                    Text(LocalizedStringKey(apiClient.useMockData ? "console.more.sample_on" : "console.more.sample_off"))
                        .font(.footnote).foregroundColor(.secondary)
                    if let error = store.lastError { Text(error).font(.footnote).foregroundColor(Theme.danger) }
                    Button { appState.isSettingsPresented = true } label: { Label("console.more.dev_settings", systemImage: "gearshape") }
                }
            }
            .navigationTitle(LocalizedStringKey("console.tab.more"))
        }
    }
}
