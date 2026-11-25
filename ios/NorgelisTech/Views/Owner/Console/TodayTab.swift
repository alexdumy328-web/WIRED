import SwiftUI

/// Identifies a job to open in a sheet.
struct JobRef: Identifiable, Hashable {
    let id: String
}

struct TodayTab: View {
    @EnvironmentObject var store: OwnerStore

    private struct Data {
        var slots: [CalendarSlot]
        var dayLabel: String
        var isToday: Bool
        var pickups: [PickupJob]
        var handback: [Booking]
    }

    @State private var state: LoadState<Data> = .loading
    @State private var open: JobRef?
    @State private var showWalkIn = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SampleNotice()
                    kpis

                    Button {
                        showWalkIn = true
                    } label: {
                        Label("console.walkin.new", systemImage: "plus.circle.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.accentColor)
                            .foregroundColor(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    DriverRadarCard()

                    switch state {
                    case .loading:
                        ProgressView().frame(maxWidth: .infinity).padding()
                    case .failed(let message):
                        ErrorBanner(message: message) { Task { await load() } }
                    case .loaded(let data):
                        schedule(data)
                        pickups(data)
                        handback(data)
                    }
                }
                .padding(16)
            }
            .navigationTitle(LocalizedStringKey("console.tab.today"))
            .navigationBarTitleDisplayMode(.large)
            .refreshable { await load() }
            .sheet(item: $open) { ref in
                BookingDetailSheet(code: ref.id)
            }
            .sheet(isPresented: $showWalkIn) {
                WalkInSheet { code in open = JobRef(id: code) }
            }
        }
        .task(id: store.version) { await load() }
    }

    // MARK: - Sections

    private var kpis: some View {
        let counts = store.counts
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            KpiCard(icon: "wrench.and.screwdriver.fill", tint: Theme.shop, title: "console.kpi.active", value: "\(counts?.active ?? 0)") {
                store.openJobs(status: nil)
            }
            KpiCard(icon: "shippingbox.fill", tint: Theme.ok, title: "console.kpi.handback", value: "\(counts?.handback ?? 0)") {
                store.openJobs(status: "handback")
            }
            if case .loaded(let data) = state {
                KpiCard(icon: "calendar", tint: Theme.mobile, title: data.isToday ? "console.kpi.visits_today" : "console.kpi.visits_next", value: "\(data.slots.count)") {
                    store.tab = .schedule
                }
                KpiCard(icon: "car.fill", tint: Theme.pickup, title: "console.kpi.pickups_today", value: "\(data.pickups.count)") {
                    store.tab = .schedule
                }
            }
        }
    }

    private func schedule(_ data: Data) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(data.isToday ? "console.today.schedule" : "console.today.schedule_next")
            if !data.isToday {
                Text(data.dayLabel).font(.subheadline).foregroundColor(.secondary)
            }
            if data.slots.isEmpty {
                Text("console.today.quiet").foregroundColor(.secondary).font(.subheadline)
            }
            ForEach(data.slots) { slot in
                Button { open = JobRef(id: slot.code) } label: {
                    HStack(spacing: 12) {
                        Text(ShopCalendar.time(slot.slot)).font(.subheadline.bold()).monospacedDigit().frame(width: 48, alignment: .leading)
                        Capsule().fill(slot.kind.color).frame(width: 4, height: 48)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(slot.device.isEmpty ? slot.code : slot.device).font(.subheadline.bold()).lineLimit(1)
                            Text(slot.name).font(.caption).foregroundColor(.secondary).lineLimit(1)
                            StatusBadge(status: slot.status)
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
    }

    private func pickups(_ data: Data) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if !data.pickups.isEmpty {
                SectionTitle("console.today.pickups", trailing: "console.today.see_all") { store.tab = .schedule }
                ForEach(data.pickups) { job in
                    Button { open = JobRef(id: job.code) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: job.trips == .dropoff ? "arrow.down.to.line" : "arrow.up.to.line")
                                .foregroundColor(Theme.pickup)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(job.address).font(.subheadline).lineLimit(1)
                                Text("\(job.name) · \(ShopCalendar.time(job.window.from))–\(ShopCalendar.time(job.window.to))")
                                    .font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                            if job.urgent {
                                Text("common.urgent").font(.caption2.bold()).padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(Theme.danger).foregroundColor(.white).clipShape(Capsule())
                            }
                        }
                        .padding(12)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func handback(_ data: Data) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if !data.handback.isEmpty {
                SectionTitle("console.today.handback", trailing: "console.today.see_all") { store.openJobs(status: "handback") }
                ForEach(data.handback) { b in
                    Button { open = JobRef(id: b.code) } label: {
                        JobRow(booking: b)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Load

    private func load() async {
        let repo = store.repo
        let today = ShopCalendar.dateString()
        do {
            async let week = repo.calendar(week: today)
            async let pickups = repo.pickups(date: today)
            async let ready = repo.bookings(BookingQuery(status: "handback", limit: 6))
            let (w, p, r) = try await (week, pickups, ready)
            var day = today
            var slots = w.days.first { $0.date == today }?.slots ?? []
            // A quiet day: show the next day that has visits instead of an empty card.
            if slots.isEmpty {
                let busy = try await repo.busy(from: ShopCalendar.addDays(today, 1), to: ShopCalendar.addDays(today, 14))
                if let next = busy.keys.sorted().first {
                    day = next
                    let nextWeek = try await repo.calendar(week: next)
                    slots = nextWeek.days.first { $0.date == next }?.slots ?? []
                }
            }
            state = .loaded(Data(slots: slots, dayLabel: ShopCalendar.short(day), isToday: day == today, pickups: p.jobs, handback: r.items))
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
