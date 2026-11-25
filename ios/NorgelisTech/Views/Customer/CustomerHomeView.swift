import SwiftUI
import MapKit
import CoreLocation

/// The signed-in customer's bookings, loaded once and shared by My repairs and Track.
@MainActor
final class CustomerBookings: ObservableObject {
    @Published private(set) var state: LoadState<[Booking]> = .loading
    /// Set when pull-to-refresh fails while older items are still shown, so the list stays visible.
    @Published private(set) var refreshError: String?
    private let api: APIClient

    init(api: APIClient = .shared) { self.api = api }

    var items: [Booking] { state.value ?? [] }

    func booking(code: String) -> Booking? {
        let needle = code.uppercased()
        return items.first { $0.code.uppercased() == needle }
    }

    /// Phone from the latest booking, used to prefill new bookings so returning customers don't retype it.
    var lastPhone: String? {
        items.compactMap { $0.contact?.phone?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
    }

    /// Today's pickups and hand-backs: what the customer has to be home for. Soonest first.
    var today: [Booking] {
        items.filter { Self.isToday($0) }.sorted { ($0.slot ?? "") < ($1.slot ?? "") }
    }

    /// In the workshop now (past the booking): ready/unrepairable first, then soonest slot.
    var active: [Booking] {
        items.filter { !Self.isToday($0) && !$0.status.isFinal && $0.status != .received }
            .sorted {
                let aReady = $0.status == .ready || $0.status == .unrepairable
                let bReady = $1.status == .ready || $1.status == .unrepairable
                if aReady != bReady { return aReady }
                return ($0.slot ?? "") < ($1.slot ?? "")
            }
    }

    /// Booked, not started: soonest first.
    var upcoming: [Booking] {
        items.filter { !Self.isToday($0) && $0.status == .received }.sorted { ($0.slot ?? "") < ($1.slot ?? "") }
    }

    var finished: [Booking] { items.filter { !Self.isToday($0) && $0.status.isFinal } }

    /// A pickup or delivery happening today, or a finished repair the driver may bring back today.
    static func isToday(_ b: Booking) -> Bool {
        guard b.status != .done, b.status != .cancelled else { return false }
        if let slot = b.slot, ShopCalendar.day(of: slot) == ShopCalendar.dateString() { return true }
        return b.hasPickup && BookingSummaryCard.driverMayCome(b)
    }

    func load() async {
        if case .loaded = state {} else { state = .loading }
        do {
            let items = try await api.fetchMyBookings().sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            state = .loaded(items)
            refreshError = nil
            await PushService.shared.refreshStatus()
        } catch is CancellationError {
            return
        } catch {
            let msg = customerErrorMessage(error)
            if state.value == nil { state = .failed(msg) }
            else { refreshError = msg }
        }
    }
}

/// A signed-in customer: their own repairs, a code lookup, and the account.
struct CustomerHomeView: View {
    @EnvironmentObject var push: PushService
    @EnvironmentObject var appState: AppState
    @StateObject private var bookings = CustomerBookings()
    @State private var tab = Tab.repairs
    @State private var openBookingCode: String?

    enum Tab: Hashable { case repairs, track, account }

    var body: some View {
        TabView(selection: $tab) {
            MyRepairsView(store: bookings, openBookingCode: $openBookingCode)
                .tabItem { Label("customer.tab.repairs", systemImage: "wrench.and.screwdriver.fill") }
                .tag(Tab.repairs)
            NavigationStack {
                TrackView(store: bookings)
                    .navigationTitle(LocalizedStringKey("customer.title")).navigationBarTitleDisplayMode(.inline)
            }
                .tabItem { Label("customer.tab.track", systemImage: "location.magnifyingglass") }
                .tag(Tab.track)
            NavigationStack { AccountView() }
                .tabItem { Label("customer.tab.account", systemImage: "person.crop.circle.fill") }
                .tag(Tab.account)
        }
        .task { await bookings.load() }
        // A tapped notification, Live Activity or booking link opens the full own booking when it belongs to this account.
        .onReceive(push.$openCode.compactMap { $0 }) { code in
            push.openCode = nil
            Task { await openDeepLink(code: code) }
        }
    }

    private func openDeepLink(code: String) async {
        let normalized = AppState.normalizeBookingCode(code)
        if bookings.items.isEmpty { await bookings.load() }
        if bookings.booking(code: normalized) != nil {
            tab = .repairs
            openBookingCode = normalized
        } else {
            appState.searchBooking(code: normalized)
            tab = .track
        }
    }
}

/// Everything booked under this account: today's pickups pinned on top, then what is in the workshop, then the past.
struct MyRepairsView: View {
    @ObservedObject var store: CustomerBookings
    @Binding var openBookingCode: String?
    @EnvironmentObject var push: PushService
    @AppStorage("norgelis_alerts_prompt_dismissed") private var alertsDismissed = false
    @State private var showBooking = false

    var body: some View {
        NavigationStack {
            List {
                if let message = store.refreshError {
                    Section {
                        HStack(spacing: 10) {
                            Image(systemName: "wifi.exclamationmark").foregroundColor(Theme.danger).accessibilityHidden(true)
                            Text(message).font(.footnote).foregroundColor(.secondary)
                            Spacer(minLength: 4)
                            Button("common.retry") { Task { await store.load() } }.font(.footnote.bold())
                        }
                    }
                }
                switch store.state {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
                case .failed(let message):
                    ErrorBanner(message: message) { Task { await store.load() } }.listRowBackground(Color.clear)
                case .loaded(let items):
                    if !items.isEmpty && push.authStatus == .notDetermined && !alertsDismissed {
                        Section { alertsPrompt }
                    }
                    if items.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "tray").font(.largeTitle).foregroundColor(.secondary).accessibilityHidden(true)
                            Text("customer.repairs.empty").font(.headline)
                            Text("customer.repairs.empty_hint").font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
                            Button { showBooking = true } label: {
                                Text("booking.new").foregroundStyle(Theme.onAccent).frame(minHeight: 44)
                            }
                            .buttonStyle(.borderedProminent)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 24).listRowBackground(Color.clear)
                    }
                    if !store.today.isEmpty {
                        Section {
                            ForEach(store.today) { booking in link(booking, pinned: true) }
                        } header: {
                            Label("customer.repairs.today", systemImage: "pin.fill").font(.subheadline.bold()).foregroundColor(Theme.pickup).textCase(nil)
                        }
                    }
                    if !store.active.isEmpty {
                        Section("customer.repairs.active") { ForEach(store.active) { booking in link(booking) } }
                    }
                    if !store.upcoming.isEmpty {
                        Section("customer.repairs.upcoming") { ForEach(store.upcoming) { booking in link(booking) } }
                    }
                    if !store.finished.isEmpty {
                        Section("customer.repairs.past") { ForEach(store.finished) { booking in link(booking) } }
                    }
                }
            }
            .navigationTitle(LocalizedStringKey("customer.tab.repairs"))
            .navigationDestination(item: $openBookingCode) { code in
                BookingDetailScreen(code: code, fallback: store.booking(code: code), store: store)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showBooking = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel(Text("booking.new"))
                }
            }
            .refreshable { await store.load() }
            .sheet(isPresented: $showBooking, onDismiss: { Task { await store.load() } }) {
                BookingFlowView(knownPhone: store.lastPhone) { code in
                    showBooking = false
                    Task {
                        await store.load()
                        openBookingCode = code
                    }
                }
            }
            .animation(.snappy, value: store.items.map(\.code))
        }
    }

    /// Inline explanation shown before the iOS notifications permission alert.
    private var alertsPrompt: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "bell.badge.fill").foregroundColor(Theme.pickup).font(.title3).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("alerts.prompt.title").font(.subheadline.bold())
                    Text("alerts.prompt.body").font(.caption).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
                }
            }
            HStack(spacing: 10) {
                Button {
                    Task { await push.requestAlerts() }
                } label: {
                    Text("alerts.prompt.enable").font(.footnote.bold()).foregroundStyle(Theme.onAccent).frame(minHeight: 36)
                }
                .buttonStyle(.borderedProminent)
                Button("alerts.prompt.later") { alertsDismissed = true }
                    .font(.footnote).foregroundColor(.secondary)
                    .frame(minHeight: 36)
            }
        }
        .padding(.vertical, 4)
    }

    private func link(_ booking: Booking, pinned: Bool = false) -> some View {
        NavigationLink {
            BookingDetailScreen(code: booking.code, fallback: booking, store: store)
        } label: { row(booking, pinned: pinned) }
    }

    private func row(_ booking: Booking, pinned: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(booking.title).font(.headline).lineLimit(1)
                Spacer(minLength: 4)
                StatusBadge(status: booking.status)
            }
            HStack(spacing: 8) {
                Text(booking.code).font(.caption.monospaced()).foregroundColor(.secondary).fixedSize()
                KindChip(kind: booking.kind)
                Spacer(minLength: 4)
                if pinned, let slot = booking.slot, ShopCalendar.day(of: slot) == ShopCalendar.dateString() {
                    HStack(spacing: 3) {
                        Image(systemName: "clock").accessibilityHidden(true)
                        Text(ShopCalendar.time(slot))
                    }
                    .font(.caption.bold().monospacedDigit())
                    .foregroundColor(Theme.pickup)
                    .lineLimit(1)
                    .fixedSize()
                } else if pinned {
                    HStack(spacing: 3) {
                        Image(systemName: "shippingbox.and.arrow.backward").accessibilityHidden(true)
                        Text("customer.repairs.coming_back")
                    }
                    .font(.caption.bold())
                    .foregroundColor(Theme.pickup)
                    .lineLimit(1)
                } else if let slot = booking.slot {
                    HStack(spacing: 3) {
                        Image(systemName: "calendar").accessibilityHidden(true)
                        Text(ShopCalendar.dateTime(slot))
                    }
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .fixedSize()
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// Live-updating detail wrapper for a signed-in customer's booking: pull-to-refresh and cancellation refresh in place.
private struct BookingDetailScreen: View {
    let code: String
    let fallback: Booking?
    @ObservedObject var store: CustomerBookings

    private var booking: Booking? { store.booking(code: code) ?? fallback }

    var body: some View {
        ScrollView {
            if let booking {
                BookingSummaryCard(booking: booking) { await store.load() }
                    .padding(16)
            } else {
                ProgressView().padding(32)
            }
        }
        .navigationTitle(code)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.load() }
    }
}

/// Look a repair up by its code. Works without an account; when signed in, shows today's items by default
/// and resolves the customer's own codes with full detail.
struct TrackView: View {
    @EnvironmentObject var appState: AppState
    @State private var inputCode = ""
    /// Signed-in customer store (nil for guest lookup from WelcomeView).
    var store: CustomerBookings?

    private var today: [Booking] { store?.today ?? [] }

    /// Own booking if the entered/searched code belongs to the signed-in customer, else the guest lookup result.
    private var resolvedBooking: Booking? {
        if !appState.customerSearchQuery.isEmpty, let own = store?.booking(code: appState.customerSearchQuery) {
            return own
        }
        return appState.currentCustomerBooking
    }

    private var canSearch: Bool {
        !inputCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if resolvedBooking == nil, !today.isEmpty {
                    VStack(alignment: .leading, spacing: 16) {
                        Label("customer.repairs.today", systemImage: "pin.fill")
                            .font(.headline)
                            .foregroundColor(Theme.pickup)

                        ForEach(Array(today.enumerated()), id: \.element.id) { index, booking in
                            if index > 0 {
                                Divider().padding(.vertical, 6)
                            }
                            VStack(alignment: .leading, spacing: 12) {
                                todayHeader(booking)
                                BookingSummaryCard(booking: booking) { await store?.load() }
                            }
                        }
                    }

                    Divider().padding(.vertical, 4)
                }

                lookupBox

                if appState.customerLookupBusy { ProgressView().padding() }
                if let message = appState.customerLookupError, resolvedBooking == nil {
                    Label(message, systemImage: "magnifyingglass")
                        .font(.subheadline).foregroundColor(.secondary)
                        .padding().frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
                }
                if let booking = resolvedBooking {
                    if !today.isEmpty {
                        Button {
                            inputCode = ""
                            appState.clearCustomerLookup()
                        } label: {
                            Label("customer.track.back_today", systemImage: "chevron.left")
                                .font(.subheadline.bold())
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .frame(minHeight: 36)
                        }
                    }
                    BookingSummaryCard(booking: booking) { await store?.load() }
                } else if today.isEmpty && !appState.customerLookupBusy && appState.customerLookupError == nil {
                    Text(LocalizedStringKey("customer.no_active_bookings")).foregroundColor(.secondary).padding()
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable {
            await store?.load()
            if !appState.customerSearchQuery.isEmpty, store?.booking(code: appState.customerSearchQuery) == nil {
                appState.searchBooking(code: appState.customerSearchQuery)
            }
        }
        .onAppear {
            if !appState.customerSearchQuery.isEmpty { inputCode = appState.customerSearchQuery }
        }
        .onChange(of: appState.customerSearchQuery) { _, new in
            if inputCode != new { inputCode = new }
        }
    }

    private func todayHeader(_ booking: Booking) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(booking.title).font(.headline).lineLimit(1)
            Spacer(minLength: 4)
            Text(booking.code).font(.caption.monospaced()).foregroundColor(.secondary)
            if let slot = booking.slot, ShopCalendar.day(of: slot) == ShopCalendar.dateString() {
                Label(ShopCalendar.time(slot), systemImage: "clock")
                    .font(.caption.bold())
                    .foregroundColor(Theme.pickup)
            }
        }
    }

    private var lookupBox: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(today.isEmpty ? "customer.lookup.title" : "customer.lookup.other").font(.headline)
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    TextField(LocalizedStringKey("customer.lookup.placeholder"), text: $inputCode)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.characters)
                        .submitLabel(.search)
                        .onSubmit { runSearch() }
                    if !inputCode.isEmpty {
                        Button {
                            inputCode = ""
                            appState.clearCustomerLookup()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary)
                                .frame(minWidth: 32, minHeight: 32)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text("common.clear"))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(minHeight: 44)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 10))

                Button { runSearch() } label: {
                    Image(systemName: "magnifyingglass").font(.headline).foregroundColor(Theme.onAccent)
                        .frame(minWidth: 44, minHeight: 44)
                        .background(canSearch ? Color.accentColor : Color.accentColor.opacity(0.4))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .disabled(!canSearch)
                .accessibilityLabel(Text("customer.search.button"))
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func runSearch() {
        let normalized = AppState.normalizeBookingCode(inputCode)
        guard !normalized.isEmpty else { return }
        inputCode = normalized
        if store?.booking(code: normalized) != nil {
            // Own booking: show full detail immediately without hitting the stripped guest route.
            appState.clearCustomerLookup()
            appState.customerSearchQuery = normalized
        } else {
            appState.searchBooking(code: normalized)
        }
    }
}

/// One booking: status, the driver card when a pickup is on, price, date, issue and address.
struct BookingSummaryCard: View {
    /// Only bookings a driver can actually be heading to are polled: a pickup today (or a missed one not collected
    /// yet), or a finished repair going back. A guest lookup has no pickup details: the booking day decides.
    static func driverMayCome(_ b: Booking) -> Bool {
        guard b.status != .done, b.status != .cancelled, b.mode != "mobile" else { return false }
        if let trips = b.pickup?.trips {
            if trips == .pickup, (b.status != .received || b.collectedAt != nil) { return false }
            if trips == .dropoff, b.status == .received { return false }
        }
        if b.status == .ready || b.status == .unrepairable {
            return b.pickup == nil || b.pickup?.trips != .pickup
        }
        // Already collected at the workshop: driver is not heading back until ready/unrepairable.
        if b.status == .received, b.collectedAt != nil { return false }
        guard let slot = b.slot else { return false }
        let day = ShopCalendar.day(of: slot), today = ShopCalendar.dateString()
        // A collection that was missed (nobody home) and is still to do: the driver may come back today.
        if b.pickup != nil, b.status == .received, b.collectedAt == nil, day < today { return true }
        guard day == today else { return false }
        return b.pickup != nil || b.isGuestLookup
    }

    @EnvironmentObject var appState: AppState
    @EnvironmentObject var api: APIClient
    @Environment(\.openURL) private var openURL
    let booking: Booking
    /// Called after the customer changed the booking (cancelled it), to reload the list.
    var onChange: (() async -> Void)?

    @State private var share: ShareItem?
    @State private var downloading: String?
    @State private var downloadFailed = false
    @State private var confirmCancel = false
    @State private var cancelError: String?
    @State private var copied = false

    /// The driver still has an upcoming trip: collecting an uncollected device, or returning a finished one.
    private var driverStillComes: Bool {
        guard booking.hasPickup else { return false }
        if booking.status == .received {
            return booking.pickup?.trips != .dropoff && booking.collectedAt == nil
        }
        if booking.status == .ready || booking.status == .unrepairable {
            return booking.pickup?.trips != .pickup
        }
        return false
    }

    /// Signed-in view (the guest lookup has no contact, device or history).
    private var isOwnBooking: Bool { booking.contact != nil }

    private var canCancel: Bool {
        guard isOwnBooking, booking.status == .received, let slot = booking.slot, let date = ShopCalendar.parse(slot) else { return false }
        return date.timeIntervalSinceNow > 2 * 3600
    }

    private var toPay: Int? {
        guard let final = booking.finalLei, booking.status == .ready || booking.status == .done || booking.status == .unrepairable else { return nil }
        return final + Int(booking.pickup?.quote?.totalLei ?? 0)
    }

    var body: some View {
        VStack(spacing: 16) {
            // Where the repair is, at a glance.
            RepairProgress(booking: booking)
            if Self.driverMayCome(booking) {
                DriverOnTheWay(code: booking.code, destination: booking.pickup.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) },
                               device: booking.device?.displayName ?? "", address: booking.pickup?.address,
                               fallback: driverStillComes ? booking : nil)
            } else if driverStillComes {
                PickupContactRow(booking: booking)
            }

            details
            if isOwnBooking { documents }
            actions
        }
        .sheet(item: $share) { ShareSheet(url: $0.url) }
        .confirmationDialog("customer.cancel.title", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("customer.cancel.confirm", role: .destructive) { Task { await cancel() } }
            Button("customer.cancel.keep", role: .cancel) {}
        } message: {
            Text("customer.cancel.message")
        }
        .alert(Text("customer.cancel.failed"), isPresented: Binding(get: { cancelError != nil }, set: { if !$0 { cancelError = nil } })) {
            Button("common.ok", role: .cancel) {}
        } message: { Text(cancelError ?? "") }
        .alert(Text("customer.docs.failed"), isPresented: $downloadFailed) {
            Button("common.ok", role: .cancel) {}
        }
    }

    // MARK: - What it is

    private var details: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                // Tap to copy: the code is what the shop asks for on the phone.
                Button {
                    UIPasteboard.general.string = booking.code
                    copied = true
                    Task { try? await Task.sleep(nanoseconds: 1_500_000_000); copied = false }
                } label: {
                    HStack(spacing: 6) {
                        Text(booking.code).font(.title3.bold().monospaced())
                        Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.footnote).foregroundColor(.secondary)
                    }
                    .frame(minHeight: 36)
                }
                .buttonStyle(.plain)
                .accessibilityHint(Text("customer.code.copy_hint"))
                Spacer()
                StatusBadge(status: booking.status)
            }
            Divider()
            VStack(alignment: .leading, spacing: 8) {
                if isOwnBooking { LabeledContent("console.job.device_label", value: booking.title) }
                if !booking.serviceNames.isEmpty {
                    LabeledContent("customer.booking.services") {
                        Text(booking.serviceNames.joined(separator: ", ")).multilineTextAlignment(.trailing)
                    }
                }
                // The guest lookup cannot tell a pickup from a workshop visit: no kind rather than a wrong one.
                if !(booking.isGuestLookup && booking.kind == .shop) {
                    HStack {
                        Text(LocalizedStringKey("booking.kind.label"))
                        Spacer()
                        KindChip(kind: booking.kind)
                    }
                }
                if let toPay {
                    LabeledContent("customer.booking.to_pay") { Text(Money.lei(toPay)).font(.headline).foregroundColor(Theme.ok) }
                } else if let estimate = booking.estimate {
                    PriceRow(estimate: estimate)
                }
                if let slot = booking.slot { LabeledContent("customer.booking.date", value: ShopCalendar.dateTime(slot)) }
                if let location = booking.location, booking.kind == .mobile { LabeledContent("customer.booking.location", value: location) }
                if let issue = booking.issue {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("customer.booking.issue").font(.caption).foregroundColor(.secondary)
                        Text(issue).font(.body)
                    }
                }
                if let work = booking.repair?.workDone, !work.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("customer.booking.work_done").font(.caption).foregroundColor(.secondary)
                        Text(work).font(.body)
                    }
                }
                if booking.isGuestLookup, let updated = booking.updatedAt {
                    Text("customer.booking.updated \(ShopCalendar.dateTime(updated))").font(.caption).foregroundColor(.secondary)
                }
            }
            if let pickup = booking.pickup {
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    Label("customer.pickup.address", systemImage: "mappin.circle.fill").font(.subheadline.bold())
                    Text(pickup.address).font(.subheadline).foregroundColor(.secondary)
                    if let total = pickup.quote?.totalLei {
                        Text("customer.pickup.cost \(Int(total))").font(.caption.bold()).foregroundColor(Theme.pickup)
                    }
                }
            }
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Papers

    @ViewBuilder
    private var documents: some View {
        let sheet = booking.intake != nil
        if sheet || booking.warranty != nil {
            VStack(alignment: .leading, spacing: 4) {
                Text("customer.docs.title").font(.subheadline.bold()).padding(.bottom, 4)
                if sheet {
                    docRow("customer.docs.sheet", icon: "doc.text.fill", id: "sheet", path: "api/me/bookings/\(booking.code)/intake.pdf", file: "\(booking.code)-fisa.pdf")
                }
                if let w = booking.warranty {
                    docRow("customer.docs.warranty \(ShopCalendar.medium(w.endsOn))", icon: "checkmark.shield.fill", id: "warranty", path: "api/me/warranties/\(w.id).pdf", file: "garantie-\(w.label).pdf")
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        }
    }

    private func docRow(_ title: LocalizedStringKey, icon: String, id: String, path: String, file: String) -> some View {
        Button {
            Task {
                downloading = id
                defer { downloading = nil }
                do {
                    let url = try await api.download(path, fileName: file)
                    share = ShareItem(url: url)
                } catch {
                    downloadFailed = true
                }
            }
        } label: {
            HStack {
                Label(title, systemImage: icon)
                Spacer()
                if downloading == id { ProgressView() } else { Image(systemName: "arrow.down.circle").foregroundColor(.secondary) }
            }
            .frame(minHeight: 44)
        }
        .disabled(downloading != nil)
    }

    // MARK: - What the customer can do

    private var actions: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                if let phone = Shop.phone, let url = Shop.whatsappURL(phone, text: String(format: String(localized: "customer.whatsapp.about %@"), booking.code)) {
                    actionButton("contact.whatsapp", icon: "message.fill") { openURL(url) }
                }
                if let phone = Shop.phone, let url = Shop.telURL(phone) {
                    actionButton("contact.call", icon: "phone.fill") { openURL(url) }
                }
                if booking.kind == .shop, booking.status == .received || booking.status == .ready || booking.status == .unrepairable {
                    actionButton("contact.directions", icon: "map.fill") { openDirections() }
                }
            }
            if booking.kind == .shop, booking.status == .received || booking.status == .ready || booking.status == .unrepairable {
                Label("shop.hours", systemImage: "clock").font(.caption).foregroundColor(.secondary).frame(maxWidth: .infinity, alignment: .leading)
            }
            if canCancel {
                Button(role: .destructive) { confirmCancel = true } label: {
                    Text("customer.cancel.button").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func actionButton(_ title: LocalizedStringKey, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.headline)
                Text(title).font(.caption.bold()).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 56)
        }
        .buttonStyle(.bordered)
        .tint(.primary)
    }

    private func openDirections() {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: Shop.coordinate))
        item.name = Shop.name
        item.openInMaps()
    }

    private func cancel() async {
        do {
            try await api.requestVoid("POST", "api/me/bookings/\(booking.code)/cancel", body: [:])
            await onChange?()
        } catch {
            cancelError = String(localized: "customer.cancel.too_late")
        }
    }
}

/// A round phone button for the driver's number (it only opens the dialer).
struct CallDriverButton: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let phone = Shop.driverPhone, let url = Shop.telURL(phone) {
            Button { openURL(url) } label: {
                Image(systemName: "phone.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Theme.pickup))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("customer.call_driver"))
        }
    }
}

/// When the driver comes (or brings the repair back), in one line, with the call button at the side.
struct PickupContactRow: View {
    let booking: Booking

    private var returning: Bool { booking.status == .ready || booking.status == .unrepairable }

    private var slotPassed: Bool {
        guard !returning, let slot = booking.slot, let date = ShopCalendar.parse(slot) else { return false }
        return Date().timeIntervalSince(date) > 30 * 60
    }

    private var title: Text {
        if returning { return Text("customer.pickup.coming_back") }
        guard let slot = booking.slot else { return Text("customer.pickup.scheduled") }
        let time = ShopCalendar.time(slot)
        let day = ShopCalendar.day(of: slot)
        let isToday = day == ShopCalendar.dateString()
        if slotPassed {
            return isToday
                ? Text("customer.pickup.past_today \(time)")
                : Text("customer.pickup.past_on \(ShopCalendar.dayMonth(day)) \(time)")
        }
        return isToday ? Text("customer.pickup.today \(time)") : Text("customer.pickup.on \(ShopCalendar.dayMonth(day)) \(time)")
    }

    private var note: LocalizedStringKey {
        slotPassed ? "customer.pickup.past_note" : "customer.pickup.email_note"
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: returning ? "shippingbox.and.arrow.backward.fill" : "car.side.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(Theme.pickup)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Theme.pickup.opacity(0.15)))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                title.font(.subheadline.bold())
                Text(note).font(.caption).foregroundColor(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            CallDriverButton()
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}
