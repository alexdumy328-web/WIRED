import SwiftUI

struct WarrantiesView: View {
    @EnvironmentObject var store: OwnerStore

    private let states: [(String?, LocalizedStringKey)] = [
        (nil, "console.filter.all"), ("valid", "console.warranty.state.active"), ("expiring", "console.warranty.state.expiring"),
        ("expired", "console.warranty.state.expired"), ("void", "console.warranty.state.void"),
    ]

    @State private var state: String?
    @State private var text = ""
    @State private var items: [Warranty] = []
    @State private var error: String?
    @State private var loading = true
    @State private var open: JobRef?
    @State private var toVoid: Warranty?
    @State private var reason = ""
    @State private var share: ShareItem?

    var body: some View {
        List {
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(states, id: \.0) { s in
                            Button { state = s.0 } label: {
                                Text(s.1).font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 12).padding(.vertical, 7)
                                    .background(state == s.0 ? Color.accentColor : Color(.secondarySystemBackground))
                                    .foregroundColor(state == s.0 ? .white : .primary)
                                    .clipShape(Capsule())
                            }.buttonStyle(.plain)
                        }
                    }
                }
                .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                .listRowBackground(Color.clear)
            }
            if let error { ErrorBanner(message: error) { Task { await load() } }.listRowBackground(Color.clear) }
            else if items.isEmpty && !loading {
                Text("console.warranty.empty").foregroundColor(.secondary).frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
            ForEach(items) { w in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(w.label).font(.subheadline.bold())
                        Spacer()
                        WarrantyBadge(state: w.state)
                    }
                    Text("\(w.device) · \(w.customerName)").font(.subheadline)
                    Text(w.work).font(.caption).foregroundColor(.secondary).lineLimit(2)
                    HStack {
                        Text("console.warranty.until \(ShopCalendar.medium(w.endsOn))")
                        Spacer()
                        Text("\(w.months) " + String(localized: "console.warranty.months_short"))
                    }
                    .font(.caption).foregroundColor(.secondary)
                    if let v = w.voided {
                        Text("\(String(localized: "console.warranty.voided")): \(v.reason)").font(.caption).foregroundColor(Theme.danger)
                    }
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
                .onTapGesture { open = JobRef(id: w.bookingCode) }
                .swipeActions {
                    if store.role.isManager && w.state != .void {
                        Button("console.warranty.void") { toVoid = w }.tint(Theme.danger)
                    }
                    if store.isLive {
                        Button("PDF") { Task { await pdf(w) } }.tint(.accentColor)
                    }
                }
            }
        }
        .overlay { if loading && items.isEmpty { ProgressView() } }
        .navigationTitle(LocalizedStringKey("console.warranty.title"))
        .searchable(text: $text, prompt: Text("console.warranty.search"))
        .refreshable { await load() }
        .sheet(item: $open) { BookingDetailSheet(code: $0.id) }
        .sheet(item: $share) { ShareSheet(url: $0.url) }
        .alert("console.warranty.void", isPresented: Binding(get: { toVoid != nil }, set: { if !$0 { toVoid = nil } })) {
            TextField("console.warranty.void_reason", text: $reason)
            Button("console.warranty.void", role: .destructive) { Task { await void() } }
            Button("common.cancel", role: .cancel) { reason = "" }
        } message: {
            Text("console.warranty.void_hint")
        }
        .task(id: "\(store.version)|\(state ?? "")|\(text)") {
            if !text.isEmpty { try? await Task.sleep(nanoseconds: 300_000_000) }
            if !Task.isCancelled { await load() }
        }
    }

    private func load() async {
        loading = true
        do {
            items = try await store.repo.warranties(text: text, state: state, limit: 100, skip: 0).items
            error = nil
        } catch {
            if !(error is CancellationError) { self.error = error.localizedDescription }
        }
        loading = false
    }

    private func void() async {
        guard let w = toVoid else { return }
        do {
            _ = try await store.repo.voidWarranty(id: w.id, reason: reason)
            reason = ""
            toVoid = nil
            store.changed()
        } catch { self.error = error.localizedDescription }
    }

    private func pdf(_ w: Warranty) async {
        do {
            let url = try await store.repo.pdf(path: "api/admin/warranties/\(w.id).pdf", fileName: "Garantie-\(w.label.replacingOccurrences(of: "/", with: "-")).pdf")
            share = ShareItem(url: url)
        } catch { self.error = error.localizedDescription }
    }
}
