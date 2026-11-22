import SwiftUI

struct JobsTab: View {
    @EnvironmentObject var store: OwnerStore

    /// One chip per way to slice the list. The raw value is what the API takes.
    private struct Chip: Identifiable {
        let id: String
        let key: LocalizedStringKey
        let status: String?

        static let all: [Chip] = [
            Chip(id: "all", key: "console.filter.all", status: nil),
            Chip(id: "received", key: "status.received", status: "received"),
            Chip(id: "diagnosis", key: "status.diagnosis", status: "diagnosis"),
            Chip(id: "waiting-parts", key: "status.waiting-parts", status: "waiting-parts"),
            Chip(id: "repairing", key: "status.repairing", status: "repairing"),
            Chip(id: "handback", key: "console.filter.handback", status: "handback"),
            Chip(id: "done", key: "status.done", status: "done"),
            Chip(id: "cancelled", key: "status.cancelled", status: "cancelled"),
        ]
    }

    @State private var chip = "all"
    @State private var mode: AdminBookingMode?
    @State private var text = ""
    @State private var items: [Booking] = []
    @State private var total = 0
    @State private var loading = true
    @State private var error: String?
    @State private var open: JobRef?
    @State private var showWalkIn = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    chips
                        .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                        .listRowBackground(Color.clear)
                }

                if let error {
                    ErrorBanner(message: error) { Task { await reload() } }
                        .listRowBackground(Color.clear)
                } else if items.isEmpty && !loading {
                    Text("console.jobs.empty").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .listRowBackground(Color.clear)
                }

                Section {
                    ForEach(items) { booking in
                        Button { open = JobRef(id: booking.code) } label: { JobRow(booking: booking) }
                            .buttonStyle(.plain)
                            .task {
                                if booking.code == items.last?.code, items.count < total { await more() }
                            }
                    }
                } footer: {
                    if total > 0 {
                        Text("console.jobs.count \(items.count) \(total)")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .navigationTitle(LocalizedStringKey("console.tab.jobs"))
            .searchable(text: $text, prompt: Text("console.jobs.search"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("console.filter.kind", selection: $mode) {
                            Text("console.filter.all_kinds").tag(AdminBookingMode?.none)
                            Text(LocalizedStringKey(JobKind.shop.titleKey)).tag(AdminBookingMode?.some(.shop))
                            Text(LocalizedStringKey(JobKind.pickup.titleKey)).tag(AdminBookingMode?.some(.pickup))
                            Text(LocalizedStringKey(JobKind.mobile.titleKey)).tag(AdminBookingMode?.some(.mobile))
                        }
                    } label: {
                        Image(systemName: mode == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showWalkIn = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel(Text("console.walkin.new"))
                }
            }
            .refreshable { await reload() }
            .sheet(item: $open) { ref in BookingDetailSheet(code: ref.id) }
            .sheet(isPresented: $showWalkIn) { WalkInSheet { code in open = JobRef(id: code) } }
        }
        .task(id: store.version) { await reload() }
        .task(id: "\(chip)|\(mode?.rawValue ?? "")") { await reload() }
        .task(id: text) {
            // Wait for a pause in typing.
            try? await Task.sleep(nanoseconds: 300_000_000)
            if !Task.isCancelled { await reload() }
        }
        .onChange(of: store.jobsFilter) { _, new in
            if let new { chip = Chip.all.first { $0.status == new }?.id ?? "all" } else if store.tab == .jobs { chip = "all" }
        }
        .onAppear {
            if let f = store.jobsFilter { chip = Chip.all.first { $0.status == f }?.id ?? "all" }
        }
    }

    private var chips: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Chip.all) { c in
                        Button {
                            chip = c.id
                            store.jobsFilter = c.status
                        } label: {
                            Text(c.key)
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 12).padding(.vertical, 7)
                                .background(chip == c.id ? Color.accentColor : Color(.secondarySystemBackground))
                                .foregroundColor(chip == c.id ? .white : .primary)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .id(c.id)
                    }
                }
                .padding(.horizontal, 16)
            }
            .onChange(of: chip) { _, id in
                withAnimation { proxy.scrollTo(id, anchor: .center) }
            }
            .onAppear { proxy.scrollTo(chip, anchor: .center) }
        }
    }

    private var query: BookingQuery {
        BookingQuery(status: Chip.all.first { $0.id == chip }?.status, mode: mode, text: text, limit: 30, skip: 0)
    }

    private func reload() async {
        loading = true
        do {
            let page = try await store.repo.bookings(query)
            items = page.items
            total = page.total
            error = nil
        } catch {
            if !(error is CancellationError) { self.error = error.localizedDescription }
        }
        loading = false
    }

    private func more() async {
        var q = query
        q.skip = items.count
        if let page = try? await store.repo.bookings(q) {
            items += page.items
            total = page.total
        }
    }
}
