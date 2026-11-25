import SwiftUI

/// Everything for a staff account: today's overview, jobs, the driver map, the schedule and the rest.
/// Technicians see no prices or settings. Owners and devs also get the backend settings.
struct StaffHomeView: View {
    @EnvironmentObject var store: OwnerStore
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var appState: AppState

    var body: some View {
        TabView(selection: $store.tab) {
            TodayTab()
                .tabItem { Label("console.tab.today", systemImage: "sun.max.fill") }
                .tag(OwnerStore.Tab.today)
            JobsTab()
                .tabItem { Label("console.tab.jobs", systemImage: "wrench.and.screwdriver.fill") }
                .tag(OwnerStore.Tab.jobs)
            DriverRootView(onClose: { store.tab = .today })
                .tabItem { Label("console.tab.driver", systemImage: "car.fill") }
                .tag(OwnerStore.Tab.driver)
            ScheduleTab()
                .tabItem { Label("console.tab.schedule", systemImage: "calendar") }
                .tag(OwnerStore.Tab.schedule)
            MoreTab()
                .tabItem { Label("console.tab.more", systemImage: "ellipsis.circle.fill") }
                .tag(OwnerStore.Tab.more)
        }
        .task(id: "\(apiClient.useMockData)-\(apiClient.baseURLString)-\(auth.viewer?.id ?? "")") {
            await store.bootstrap()
            await appState.loadStops()
        }
    }
}

/// A reminder that nothing on screen is real. Shown at the top of Today and More while sample data is on.
struct SampleNotice: View {
    @EnvironmentObject var apiClient: APIClient

    var body: some View {
        if apiClient.useMockData {
            Label("console.sample.banner", systemImage: "exclamationmark.triangle.fill")
                .font(.footnote.bold())
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Theme.rose.opacity(0.16), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .foregroundColor(Theme.rose)
        }
    }
}

struct MoreTab: View {
    @EnvironmentObject var store: OwnerStore
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        NavigationStack {
            List {
                if apiClient.useMockData {
                    Section { SampleNotice() }.listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                }
                Section {
                    NavigationLink {
                        CustomersTab(embedded: true)
                    } label: {
                        Label("console.tab.customers", systemImage: "person.2.fill")
                    }
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

                Section {
                    NavigationLink { AccountView() } label: { Label("auth.account.title", systemImage: "person.crop.circle.fill") }
                    // Owners and devs only. A demo account (sample data) has no server to configure.
                    if auth.viewer?.isStaff == true, store.role.isManager {
                        NavigationLink { BackendSettingsView() } label: { Label("console.more.dev_settings", systemImage: "server.rack") }
                    }
                }

                if !store.role.isManager {
                    Section { Text("console.more.technician_note").font(.footnote).foregroundColor(.secondary) }
                }
                if apiClient.useMockData {
                    Section("console.more.account") {
                        Picker("console.more.preview_as", selection: Binding(get: { store.role }, set: { store.chooseMockRole($0) })) {
                            ForEach(StaffRole.allCases) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
                        }
                    }
                }
                if let error = store.lastError {
                    Section { Text(error).font(.footnote).foregroundColor(Theme.danger) }
                }
            }
            .navigationTitle(LocalizedStringKey("console.tab.more"))
        }
    }
}
