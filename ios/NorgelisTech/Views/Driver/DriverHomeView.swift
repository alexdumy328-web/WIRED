import SwiftUI
import MapKit

/// What a driver account sees: today's run, the pickup and delivery jobs, the driver map and the schedule.
/// No customers list, warranties, money, stats, settings or workshop visits, here and on the server.
struct DriverHomeView: View {
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            DriverTodayView(openMap: { tab = 2 })
                .tabItem { Label("console.tab.today", systemImage: "sun.max.fill") }.tag(0)
            DriverJobsView()
                .tabItem { Label("driver.tab.jobs", systemImage: "shippingbox.fill") }.tag(1)
            DriverRootView()
                .tabItem { Label("console.tab.driver", systemImage: "car.fill") }.tag(2)
            DriverScheduleView()
                .tabItem { Label("console.tab.schedule", systemImage: "calendar") }.tag(3)
            NavigationStack { AccountView() }
                .tabItem { Label("auth.account.title", systemImage: "person.crop.circle.fill") }.tag(4)
        }
    }
}

/// The driver's calls to the API. Everything lives under /api/driver, which the server limits to pickup jobs.
struct DriverAPI {
    let api: APIClient = .shared

    func pickups(day: String) async throws -> [PickupJob] {
        let reply: PickupsResponse = try await api.request("GET", "api/driver/pickups", query: [URLQueryItem(name: "date", value: day)])
        return reply.jobs
    }

    func jobs(status: String?, skip: Int = 0) async throws -> Page<Booking> {
        var query = [URLQueryItem(name: "limit", value: "40"), URLQueryItem(name: "skip", value: "\(skip)")]
        if let status { query.append(URLQueryItem(name: "status", value: status)) }
        return try await api.request("GET", "api/driver/jobs", query: query)
    }

    func busy(from: String, to: String) async throws -> [String: BusyDaySummary] {
        let reply: BusyDaysResponse = try await api.request("GET", "api/driver/busy", query: [URLQueryItem(name: "from", value: from), URLQueryItem(name: "to", value: to)])
        return reply.days
    }

    func booking(code: String) async throws -> Booking {
        try await api.request("GET", "api/driver/bookings/\(code)")
    }

    func update(code: String, delivered: Bool, note: String?) async throws -> Booking {
        var body: [String: Any] = ["delivered": delivered]
        if let note, !note.isEmpty { body["note"] = note }
        return try await api.request("PATCH", "api/driver/bookings/\(code)/status", body: body)
    }
}

// MARK: - Today

/// The run for today: how far and how long it is to drive, then the stops in order.
struct DriverTodayView: View {
    @EnvironmentObject var appState: AppState
    let openMap: () -> Void
    @State private var open: JobRef?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    DriverRunCard(planner: appState.planner, remaining: appState.remainingStops.count, done: appState.completedStops.count, total: appState.stops.count,
                                  loading: appState.stopsLoading && appState.stops.isEmpty)
                    Button(action: openMap) {
                        Label(LocalizedStringKey(appState.isDriverEnRoute ? "driver.today.open_trip" : "driver.today.start"), systemImage: "car.fill")
                            .font(.headline).frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(appState.stops.isEmpty)

                    if let error = appState.stopsError {
                        ErrorBanner(message: error) { Task { await appState.loadStops() } }
                    }
                    if appState.stops.isEmpty && !appState.stopsLoading {
                        Text("driver.empty_today").foregroundColor(.secondary).frame(maxWidth: .infinity).padding(.top, 24)
                    }
                    ForEach(appState.stops) { stop in
                        Button { open = JobRef(id: stop.bookingCode) } label: { stopRow(stop) }.buttonStyle(.plain)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .padding(16)
                // Stops arriving, finishing or reordering glide instead of jumping.
                .animation(.snappy, value: appState.stops.map { "\($0.id)\($0.isCompleted)" })
            }
            .navigationTitle(LocalizedStringKey("console.tab.today"))
            .refreshable { await appState.loadStops() }
            .sheet(item: $open) { ref in DriverJobDetailView(code: ref.id) }
        }
        .task { await appState.loadStops() }
    }

    private func stopRow(_ stop: PickupStop) -> some View {
        HStack(spacing: 12) {
            Image(systemName: stop.isCompleted ? "checkmark.circle.fill" : "circle")
                .foregroundColor(stop.isCompleted ? Theme.ok : .secondary)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(stop.scheduledTime).font(.subheadline.bold().monospacedDigit())
                    Text(LocalizedStringKey(stop.type.localizedTitleKey)).font(.caption).foregroundColor(Theme.pickup)
                    if stop.isUrgent { Text("common.urgent").font(.caption2.bold()).foregroundColor(Theme.danger) }
                }
                Text(stop.customerName).font(.headline)
                Text(stop.address).font(.footnote).foregroundColor(.secondary).lineLimit(2)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.footnote).foregroundColor(.secondary)
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .opacity(stop.isCompleted ? 0.6 : 1)
    }
}

/// Three separate widgets for today's run: how far to drive, how long it takes, how many stops are done.
struct DriverRunCard: View {
    @ObservedObject var planner: DriverRoutePlanner
    let remaining: Int
    let done: Int
    let total: Int
    /// The run has not arrived yet: placeholders, not a "0 km" that then jumps.
    var loading = false

    var body: some View {
        HStack(spacing: 10) {
            widget("point.topleft.down.to.point.bottomright.curvepath.fill", Theme.pickup,
                   remaining == 0 ? "0 km" : DriveFormat.distance(planner.totalMeters), "driver.today.distance")
            widget("clock.fill", Theme.shop,
                   remaining == 0 ? "0 min" : DriveFormat.duration(planner.totalSeconds), "driver.today.drive_time")
            widget("checkmark.circle.fill", Theme.ok, "\(done)/\(total)", "driver.today.done")
        }
        .redacted(reason: loading ? .placeholder : [])
        .animation(.snappy, value: loading)
        .overlay(alignment: .topTrailing) {
            if planner.isPlanning { ProgressView().controlSize(.mini).padding(8) }
        }
    }

    private func widget(_ icon: String, _ tint: Color, _ value: String, _ title: LocalizedStringKey) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundColor(tint)
                .frame(width: 30, height: 30)
                .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            Text(value).font(.title3.bold().monospacedDigit()).minimumScaleFactor(0.7).lineLimit(1)
                // Numbers roll to their new value when the route is planned or a stop is done.
                .contentTransition(.numericText())
                .animation(.snappy, value: value)
            Text(title).font(.caption).foregroundColor(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Jobs

/// Pickup and delivery jobs: what to collect and what is ready to hand back.
struct DriverJobsView: View {
    private enum Filter: String, CaseIterable, Identifiable {
        case collect = "received", deliver = "handback", all = ""
        var id: String { rawValue }
        var title: LocalizedStringKey {
            switch self {
            case .collect: return "driver.jobs.collect"
            case .deliver: return "driver.jobs.deliver"
            case .all: return "console.filter.all"
            }
        }
    }

    @State private var filter: Filter = .collect
    @State private var items: [Booking] = []
    @State private var total = 0
    @State private var loading = true
    @State private var error: String?
    @State private var open: JobRef?
    private let api = DriverAPI()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("driver.tab.jobs", selection: $filter) {
                        ForEach(Filter.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }
                if let error {
                    ErrorBanner(message: error) { Task { await load() } }.listRowBackground(Color.clear)
                } else if items.isEmpty && !loading {
                    Text("console.jobs.empty").foregroundColor(.secondary).frame(maxWidth: .infinity).listRowBackground(Color.clear)
                }
                ForEach(items) { b in
                    Button { open = JobRef(id: b.code) } label: { row(b) }.buttonStyle(.plain)
                }
            }
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .navigationTitle(LocalizedStringKey("driver.tab.jobs"))
            .refreshable { await load() }
            .sheet(item: $open, onDismiss: { Task { await load() } }) { ref in DriverJobDetailView(code: ref.id) }
        }
        .task(id: filter) { await load() }
    }

    private func row(_ b: Booking) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(b.code).font(.subheadline.bold()).monospaced()
                Spacer()
                StatusBadge(status: b.status)
            }
            Text(b.device?.displayName ?? String(localized: "console.job.no_device")).font(.headline)
            Text(b.contact?.name ?? "").font(.subheadline).foregroundColor(.secondary)
            if let address = b.pickup?.address { Label(address, systemImage: "mappin.circle.fill").font(.caption).foregroundColor(.secondary).lineLimit(1) }
            if let slot = b.slot { Text(ShopCalendar.dateTime(slot)).font(.caption).foregroundColor(.secondary) }
        }
        .padding(.vertical, 4)
    }

    private func load() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            let page = try await api.jobs(status: filter.rawValue.isEmpty ? nil : filter.rawValue)
            items = page.items
            total = page.total
        } catch is CancellationError {
            return
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Schedule

/// The week's pickups and deliveries, day by day.
struct DriverScheduleView: View {
    @State private var day = ShopCalendar.dateString()
    @State private var jobs: [PickupJob] = []
    @State private var busy: [String: BusyDaySummary] = [:]
    @State private var error: String?
    @State private var open: JobRef?
    private let api = DriverAPI()

    private var days: [String] { (0..<14).map { ShopCalendar.addDays(ShopCalendar.dateString(), $0) } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(days, id: \.self) { d in
                                Button { day = d } label: {
                                    VStack(spacing: 3) {
                                        Text(ShopCalendar.weekday(d)).font(.caption2)
                                        Text(ShopCalendar.dayNumber(d)).font(.headline.monospacedDigit())
                                        Circle().fill(busy[d] != nil ? Theme.pickup : Color.clear).frame(width: 6, height: 6)
                                    }
                                    .frame(width: 52, height: 62)
                                    .background(day == d ? Color.accentColor : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    .foregroundColor(day == d ? .white : .primary)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(Text(ShopCalendar.medium(d)))
                            }
                        }
                    }
                    if let error {
                        ErrorBanner(message: error) { Task { await load() } }
                    } else if jobs.isEmpty {
                        Text("driver.schedule.empty").foregroundColor(.secondary).padding(.top, 20)
                    }
                    ForEach(jobs) { job in
                        Button { open = JobRef(id: job.code) } label: { card(job) }.buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .navigationTitle(LocalizedStringKey("console.tab.schedule"))
            .refreshable { await load(); await loadBusy() }
            .sheet(item: $open) { ref in DriverJobDetailView(code: ref.id) }
        }
        .task(id: day) { await load() }
        .task { await loadBusy() }
    }

    private func loadBusy() async {
        busy = (try? await api.busy(from: ShopCalendar.dateString(), to: ShopCalendar.addDays(ShopCalendar.dateString(), 14))) ?? [:]
    }

    private func card(_ job: PickupJob) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(ShopCalendar.time(job.slot)).font(.headline.monospacedDigit()).frame(width: 52, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(LocalizedStringKey(job.trips.localizedTitleKey)).font(.caption.bold()).foregroundColor(Theme.pickup)
                    if job.urgent { Text("common.urgent").font(.caption2.bold()).foregroundColor(Theme.danger) }
                }
                Text(job.name).font(.headline)
                Text(job.address).font(.footnote).foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
            StatusDot(status: job.status)
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func load() async {
        error = nil
        do {
            let next = try await api.pickups(day: day)
            withAnimation(.snappy) { jobs = next }
        } catch is CancellationError {
            return
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - One job

/// A pickup or delivery: who, where, when, and the two things a driver can do (leave a note, mark delivered).
struct DriverJobDetailView: View {
    let code: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var booking: Booking?
    @State private var error: String?
    @State private var note = ""
    @State private var busy = false
    private let api = DriverAPI()

    var body: some View {
        NavigationStack {
            List {
                if let error { ErrorBanner(message: error) { Task { await load() } }.listRowBackground(Color.clear) }
                if let b = booking {
                    Section {
                        HStack { Text(b.code).font(.headline).monospaced(); Spacer(); StatusBadge(status: b.status) }
                        LabeledContent("console.job.device_label", value: b.device?.displayName ?? String(localized: "console.job.no_device"))
                        if let slot = b.slot { LabeledContent("customer.booking.date", value: ShopCalendar.dateTime(slot)) }
                        if let issue = b.issue { Text(issue).font(.footnote).foregroundColor(.secondary) }
                    }
                    if let contact = b.contact {
                        Section("driver.stop.contact") {
                            if let name = contact.name { Text(name).font(.headline) }
                            if let phone = contact.phone {
                                if let call = Shop.telURL(phone) { Button { openURL(call) } label: { Label(phone, systemImage: "phone.fill") } }
                                if let wa = Shop.whatsappURL(phone) { Button { openURL(wa) } label: { Label("contact.whatsapp", systemImage: "message.fill") } }
                            }
                        }
                    }
                    if let p = b.pickup {
                        Section("customer.pickup.address") {
                            Text(p.address)
                            Button { Navigator.openWaze(to: CLLocationCoordinate2D(latitude: p.lat, longitude: p.lon)) } label: { Label("driver.navigate.waze", systemImage: "location.north.line.fill") }
                            Button { Navigator.openAppleMaps(to: CLLocationCoordinate2D(latitude: p.lat, longitude: p.lon), name: b.contact?.name ?? p.address) } label: { Label("driver.navigate.apple", systemImage: "map.fill") }
                        }
                    }
                    Section("driver.job.note") {
                        TextField("driver.job.note_placeholder", text: $note, axis: .vertical).lineLimit(1...4)
                        Button("driver.job.save_note") { Task { await send(delivered: false) } }
                            .disabled(busy || note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    // A delivery closes the job. It only works once the repair is finished.
                    if b.status == .ready || b.status == .unrepairable {
                        Section {
                            Button { Task { await send(delivered: true) } } label: {
                                Label("driver.job.delivered", systemImage: "checkmark.seal.fill").frame(maxWidth: .infinity, minHeight: 44)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(busy)
                            .listRowBackground(Color.clear)
                        }
                    }
                } else if error == nil {
                    ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
                }
            }
            .navigationTitle(LocalizedStringKey("driver.job.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button(LocalizedStringKey("common.close")) { dismiss() } } }
        }
        .task { await load() }
    }

    private func load() async {
        error = nil
        do { booking = try await api.booking(code: code) } catch is CancellationError { return } catch { self.error = error.localizedDescription }
    }

    private func send(delivered: Bool) async {
        busy = true
        defer { busy = false }
        do {
            booking = try await api.update(code: code, delivered: delivered, note: note.trimmingCharacters(in: .whitespacesAndNewlines))
            note = ""
            error = nil
        } catch is CancellationError {
            return
        } catch {
            self.error = error.localizedDescription
        }
    }
}
