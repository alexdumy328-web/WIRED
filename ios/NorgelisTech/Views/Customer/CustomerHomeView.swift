import SwiftUI
import CoreLocation

/// A signed-in customer: their own repairs, a code lookup, and the account.
struct CustomerHomeView: View {
    @State private var showBooking = false

    var body: some View {
        TabView {
            MyRepairsView()
                .tabItem { Label("customer.tab.repairs", systemImage: "wrench.and.screwdriver.fill") }
            NavigationStack { TrackView().navigationTitle(LocalizedStringKey("customer.title")).navigationBarTitleDisplayMode(.inline) }
                .tabItem { Label("customer.tab.track", systemImage: "magnifyingglass") }
            NavigationStack { AccountView() }
                .tabItem { Label("customer.tab.account", systemImage: "person.crop.circle.fill") }
        }
    }
}

/// Everything booked under this account, newest first.
struct MyRepairsView: View {
    @EnvironmentObject var api: APIClient
    @State private var state: LoadState<[Booking]> = .loading
    @State private var showBooking = false

    var body: some View {
        NavigationStack {
            List {
                switch state {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
                case .failed(let message):
                    ErrorBanner(message: message) { Task { await load() } }.listRowBackground(Color.clear)
                case .loaded(let items):
                    if items.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "tray").font(.largeTitle).foregroundColor(.secondary)
                            Text("customer.repairs.empty").font(.headline)
                            Text("customer.repairs.empty_hint").font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
                            Button { showBooking = true } label: { Text("booking.new").frame(minHeight: 44) }.buttonStyle(.borderedProminent)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 24).listRowBackground(Color.clear)
                    }
                    ForEach(items) { booking in
                        NavigationLink {
                            ScrollView { BookingSummaryCard(booking: booking).padding(16) }
                                .navigationTitle(booking.code).navigationBarTitleDisplayMode(.inline)
                        } label: { row(booking) }
                    }
                }
            }
            .navigationTitle(LocalizedStringKey("customer.tab.repairs"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showBooking = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel(Text("booking.new"))
                }
            }
            .refreshable { await load() }
            .sheet(isPresented: $showBooking, onDismiss: { Task { await load() } }) { BookingFlowView() }
        }
        .task { await load() }
    }

    private func row(_ booking: Booking) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(booking.code).font(.headline.monospaced())
                Spacer()
                StatusBadge(status: booking.status)
            }
            Text(booking.device?.displayName ?? String(localized: "console.job.no_device")).font(.subheadline).foregroundColor(.secondary)
            KindChip(kind: booking.kind)
        }
        .padding(.vertical, 4)
    }

    private func load() async {
        if case .loaded = state {} else { state = .loading }
        do {
            let items = try await api.fetchMyBookings().sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
            state = .loaded(items)
        } catch is CancellationError {
            return
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

/// Look a repair up by its code. Works without an account.
struct TrackView: View {
    @EnvironmentObject var appState: AppState
    @State private var inputCode = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("customer.lookup.title").font(.headline)
                    HStack {
                        TextField(LocalizedStringKey("customer.lookup.placeholder"), text: $inputCode)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.characters)
                            .submitLabel(.search)
                            .onSubmit { appState.searchBooking(code: inputCode) }
                            .padding(12)
                            .background(Color(.systemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        Button { appState.searchBooking(code: inputCode) } label: {
                            Image(systemName: "magnifyingglass").font(.headline).foregroundColor(.white)
                                .frame(minWidth: 44, minHeight: 44)
                                .background(Color.accentColor)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .accessibilityLabel(Text("customer.search.button"))
                    }
                }
                .padding(16)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 16))

                if appState.customerLookupBusy { ProgressView().padding() }
                if let message = appState.customerLookupError {
                    Label(message, systemImage: "magnifyingglass")
                        .font(.subheadline).foregroundColor(.secondary)
                        .padding().frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.secondarySystemBackground)).clipShape(RoundedRectangle(cornerRadius: 12))
                }
                if let booking = appState.currentCustomerBooking {
                    BookingSummaryCard(booking: booking)
                } else if !appState.customerLookupBusy && appState.customerLookupError == nil {
                    Text(LocalizedStringKey("customer.no_active_bookings")).foregroundColor(.secondary).padding()
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

/// One booking: status, the driver card when a pickup is on, price, date, issue and address.
struct BookingSummaryCard: View {
    @EnvironmentObject var appState: AppState
    let booking: Booking

    var body: some View {
        VStack(spacing: 20) {
            if booking.status != .done, booking.status != .cancelled {
                DriverOnTheWay(code: booking.code, destination: booking.pickup.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) })
            }
            if booking.hasPickup, booking.status != .done, booking.status != .cancelled {
                VStack(alignment: .leading, spacing: 8) {
                    Label("customer.pickup.scheduled", systemImage: "clock.badge.checkmark.fill")
                        .font(.subheadline.bold()).foregroundColor(Theme.pickup)
                    Text(LocalizedStringKey("customer.driver.waiting")).font(.footnote).foregroundColor(.secondary)
                    CallDriverButton()
                }
                .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.pickup.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 12))
            }

            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(booking.code).font(.title3.bold())
                    Spacer()
                    StatusBadge(status: booking.status)
                }
                Divider()
                VStack(alignment: .leading, spacing: 8) {
                    // The public lookup by code leaves the device out.
                    if let device = booking.device { LabeledContent("console.job.device_label", value: device.displayName) }
                    HStack {
                        Text(LocalizedStringKey("booking.kind.label"))
                        Spacer()
                        KindChip(kind: booking.kind)
                    }
                    if let estimate = booking.estimate { PriceRow(estimate: estimate) }
                    if let slot = booking.slot { LabeledContent("customer.booking.date", value: ShopCalendar.dateTime(slot)) }
                    if let issue = booking.issue {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("customer.booking.issue").font(.caption).foregroundColor(.secondary)
                            Text(issue).font(.body)
                        }
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
    }
}

/// Calls the driver's number, or the shop's when there is no separate one. Hidden when the build has neither.
struct CallDriverButton: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let phone = Shop.driverPhone {
            Button {
                let digits = phone.filter { $0.isNumber || $0 == "+" }
                if let url = URL(string: "tel:\(digits)") { openURL(url) }
            } label: {
                Label("customer.call_driver", systemImage: "phone.fill").font(.subheadline.bold()).frame(minHeight: 44)
            }
            .buttonStyle(.bordered)
            .tint(Theme.pickup)
        }
    }
}
