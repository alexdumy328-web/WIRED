import SwiftUI

/// Week calendar and the day's pickups, sharing one day strip.
struct ScheduleTab: View {
    @EnvironmentObject var store: OwnerStore

    private enum Mode: Hashable { case visits, pickups }

    @State private var mode: Mode = .visits
    @State private var day = ShopCalendar.dateString()
    @State private var week: CalendarWeek?
    @State private var pickups: [PickupJob] = []
    @State private var error: String?
    @State private var open: JobRef?
    @State private var showWalkIn = false

    private var today: String { ShopCalendar.dateString() }
    private var slots: [CalendarSlot] { week?.days.first { $0.date == day }?.slots ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    Picker("", selection: $mode) {
                        Text("console.schedule.visits").tag(Mode.visits)
                        Text("console.schedule.pickups").tag(Mode.pickups)
                    }
                    .pickerStyle(.segmented)

                    strip

                    if let error {
                        ErrorBanner(message: error) { Task { await load() } }
                    } else if mode == .visits {
                        visits
                    } else {
                        pickupList
                    }
                }
                .padding(16)
            }
            .navigationTitle(LocalizedStringKey("console.tab.schedule"))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(LocalizedStringKey("console.schedule.today")) { day = today }.disabled(day == today)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showWalkIn = true } label: { Image(systemName: "plus") }
                }
            }
            .refreshable { await load() }
            .sheet(item: $open) { ref in BookingDetailSheet(code: ref.id) }
            .sheet(isPresented: $showWalkIn) { WalkInSheet { code in open = JobRef(id: code) } }
        }
        .task(id: "\(store.version)|\(day)") { await load() }
    }

    // MARK: - Day strip

    private var strip: some View {
        VStack(spacing: 10) {
            HStack {
                Button { day = ShopCalendar.addDays(day, -7) } label: { Image(systemName: "chevron.left") }
                Spacer()
                Text(ShopCalendar.medium(day)).font(.headline)
                Spacer()
                Button { day = ShopCalendar.addDays(day, 7) } label: { Image(systemName: "chevron.right") }
            }
            HStack(spacing: 6) {
                ForEach(week?.days ?? placeholderDays, id: \.date) { d in
                    let count = mode == .visits ? d.slots.count : d.slots.filter(\.pickup).count
                    Button { day = d.date } label: {
                        VStack(spacing: 4) {
                            Text(ShopCalendar.weekday(d.date)).font(.caption2).foregroundColor(day == d.date ? .white.opacity(0.85) : .secondary)
                            Text(ShopCalendar.dayNumber(d.date)).font(.headline).monospacedDigit()
                            Circle().fill(count > 0 ? (day == d.date ? Color.white : Theme.shop) : Color.clear).frame(width: 6, height: 6)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(day == d.date ? Color.accentColor : (d.date == today ? Color.accentColor.opacity(0.14) : Color(.secondarySystemBackground)))
                        .foregroundColor(day == d.date ? .white : .primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var placeholderDays: [CalendarDay] {
        let monday = ShopCalendar.mondayOf(day)
        return (0..<7).map { CalendarDay(date: ShopCalendar.addDays(monday, $0), slots: []) }
    }

    // MARK: - Visits

    @ViewBuilder
    private var visits: some View {
        if slots.isEmpty {
            Text("console.schedule.none").foregroundColor(.secondary).padding(.top, 24)
        }
        ForEach(slots) { slot in
            Button { open = JobRef(id: slot.code) } label: {
                HStack(spacing: 12) {
                    Text(ShopCalendar.time(slot.slot)).font(.subheadline.bold()).monospacedDigit().frame(width: 48, alignment: .leading)
                    Capsule().fill(slot.kind.color).frame(width: 4, height: 64)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(slot.device.isEmpty ? slot.code : slot.device).font(.subheadline.bold()).lineLimit(1)
                        Text(slot.name).font(.caption).foregroundColor(.secondary).lineLimit(1)
                        HStack(spacing: 8) {
                            KindChip(kind: slot.kind)
                            StatusBadge(status: slot.status)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Pickups

    @ViewBuilder
    private var pickupList: some View {
        if pickups.isEmpty {
            Text("console.schedule.no_pickups").foregroundColor(.secondary).padding(.top, 24)
        } else {
            HStack {
                Text("console.schedule.transport_total").font(.subheadline).foregroundColor(.secondary)
                Spacer()
                Text(Money.lei(pickups.reduce(0) { $0 + $1.quoteLei })).font(.subheadline.bold())
            }
        }
        ForEach(pickups) { job in
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Label(String(localized: String.LocalizationValue(job.trips.localizedTitleKey)), systemImage: job.trips == .dropoff ? "arrow.down.to.line" : "arrow.up.to.line")
                        .font(.caption.bold())
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Theme.pickup.opacity(0.14)).foregroundColor(Theme.pickup).clipShape(Capsule())
                    if job.urgent {
                        Text("common.urgent").font(.caption2.bold()).padding(.horizontal, 6).padding(.vertical, 3)
                            .background(Theme.danger).foregroundColor(.white).clipShape(Capsule())
                    }
                    Spacer()
                    StatusBadge(status: job.status)
                }
                Text(job.address).font(.headline)
                Text("\(job.name) · \(job.device)").font(.subheadline).foregroundColor(.secondary)
                HStack {
                    Label("\(ShopCalendar.time(job.window.from))–\(ShopCalendar.time(job.window.to))", systemImage: "clock")
                    Spacer()
                    Text(Money.lei(job.quoteLei)).bold()
                }
                .font(.caption).foregroundColor(.secondary)
                HStack(spacing: 8) {
                    Menu {
                        Button { Navigator.openWaze(to: .init(latitude: job.lat, longitude: job.lon)) } label: { Label("Waze", systemImage: "arrow.triangle.turn.up.right.diamond.fill") }
                        Button { Navigator.openAppleMaps(to: .init(latitude: job.lat, longitude: job.lon), name: job.name) } label: { Label("Apple Maps", systemImage: "map.fill") }
                    } label: { Label("driver.action.navigate", systemImage: "arrow.triangle.turn.up.right.diamond.fill") }
                    Button { call(job.phone) } label: { Label("console.contact.call", systemImage: "phone.fill") }
                    Button { open = JobRef(id: job.code) } label: { Label("console.schedule.open", systemImage: "doc.text") }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding(14)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    // MARK: - Load

    private func load() async {
        do {
            week = try await store.repo.calendar(week: day)
            error = nil
        } catch {
            if !(error is CancellationError) { self.error = error.localizedDescription }
        }
        await loadPickups()
    }

    private func loadPickups() async {
        pickups = (try? await store.repo.pickups(date: day).jobs) ?? []
    }
}
