import SwiftUI

struct CustomersTab: View {
    @EnvironmentObject var store: OwnerStore

    @State private var text = ""
    @State private var archived = false
    @State private var items: [Customer] = []
    @State private var total = 0
    @State private var loading = true
    @State private var error: String?
    @State private var showNew = false

    /// True when another screen already provides the navigation stack (the More tab).
    var embedded = false

    var body: some View {
        if embedded {
            content
        } else {
            NavigationStack { content }
        }
    }

    private var content: some View {
            List {
                if let error {
                    ErrorBanner(message: error) { Task { await reload() } }.listRowBackground(Color.clear)
                } else if items.isEmpty && !loading {
                    Text("console.customers.empty").foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center).listRowBackground(Color.clear)
                }
                ForEach(items) { c in
                    NavigationLink {
                        CustomerDetailView(customerId: c.id)
                    } label: {
                        CustomerRow(customer: c)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .overlay { if loading && items.isEmpty { ProgressView() } }
            .navigationTitle(LocalizedStringKey("console.tab.customers"))
            .searchable(text: $text, prompt: Text("console.customers.search"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Toggle("console.customers.archived", isOn: $archived)
                    } label: { Image(systemName: archived ? "archivebox.fill" : "archivebox").accessibilityLabel(Text("console.customers.archived")) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showNew = true } label: { Image(systemName: "person.badge.plus") }
                        .accessibilityLabel(Text("console.customers.new"))
                }
            }
            .refreshable { await reload() }
            .sheet(isPresented: $showNew) {
                CustomerFormSheet(customer: nil) { _ in store.changed() }
            }
        .task(id: "\(store.version)|\(archived)|\(text)") {
            if !text.isEmpty { try? await Task.sleep(nanoseconds: 300_000_000) }
            if !Task.isCancelled { await reload() }
        }
    }

    private func reload() async {
        loading = true
        do {
            let page = try await store.repo.customers(text: text, archived: archived, limit: 100, skip: 0)
            items = page.items
            total = page.total
            error = nil
        } catch {
            if !(error is CancellationError) { self.error = error.localizedDescription }
        }
        loading = false
    }
}

struct CustomerRow: View {
    let customer: Customer

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(customer.name).font(.headline)
                if customer.company != nil {
                    Image(systemName: "building.2.fill").font(.caption).foregroundColor(.secondary)
                }
                Spacer()
                if let open = customer.open, open > 0 {
                    Text("console.customers.open \(open)").font(.caption2.bold())
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Theme.shop.opacity(0.15)).foregroundColor(Theme.shop).clipShape(Capsule())
                }
            }
            Text(customer.phone ?? customer.email ?? "").font(.subheadline).foregroundColor(.secondary)
            if let last = customer.lastVisit, let jobs = customer.jobs {
                Text("console.customers.summary \(jobs) \(ShopCalendar.medium(ShopCalendar.day(of: last)))")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

struct CustomerDetailView: View {
    let customerId: String
    @EnvironmentObject var store: OwnerStore

    @State private var state: LoadState<CustomerDetail> = .loading
    @State private var showEdit = false
    @State private var showWalkIn = false
    @State private var open: JobRef?
    @State private var message: String?
    @State private var confirmArchive = false

    var body: some View {
        Group {
            switch state {
            case .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let text): ErrorBanner(message: text) { Task { await load() } }
            case .loaded(let d): content(d)
            }
        }
        .navigationTitle(state.value?.customer.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: store.version) { await load() }
        .sheet(item: $open) { ref in BookingDetailSheet(code: ref.id) }
    }

    @ViewBuilder
    private func content(_ d: CustomerDetail) -> some View {
        let c = d.customer
        List {
            Section {
                if let phone = c.phone, !phone.isEmpty { InfoRow(title: "console.customer.phone", value: phone) }
                if let email = c.email, !email.isEmpty { InfoRow(title: "Email", value: email) }
                InfoRow(title: "console.customer.preferred", value: String(localized: String.LocalizationValue(c.preferred.titleKey)))
                if let a = c.address { InfoRow(title: "console.customer.address", value: a) }
                ContactButtons(phone: c.phone, email: c.email)
            }
            if let company = c.company {
                Section("console.customer.company") {
                    if let v = company.name { InfoRow(title: "console.customer.company_name", value: v) }
                    if let v = company.cui { InfoRow(title: "CUI", value: v) }
                    if let v = company.regCom { InfoRow(title: "Reg. Com.", value: v) }
                }
            }
            if let notes = c.notes, !notes.isEmpty {
                Section("console.customer.notes") { Text(notes) }
            }
            Section("console.customer.jobs") {
                if d.jobs.isEmpty { Text("console.jobs.empty").foregroundColor(.secondary) }
                ForEach(d.jobs) { b in
                    Button { open = JobRef(id: b.code) } label: { JobRow(booking: b) }.buttonStyle(.plain)
                }
                Button { showWalkIn = true } label: { Label("console.walkin.new", systemImage: "plus.circle") }
            }
            if !d.warranties.isEmpty {
                Section("console.customer.warranties") {
                    ForEach(d.warranties) { w in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(w.label) · \(w.device)").font(.subheadline)
                                Text("console.warranty.until \(ShopCalendar.medium(w.endsOn))").font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                            WarrantyBadge(state: w.state)
                        }
                    }
                }
            }
            if store.role.isManager {
                Section {
                    Button(role: c.archived == true ? nil : .destructive) {
                        if c.archived == true { Task { await archive(c) } } else { confirmArchive = true }
                    } label: {
                        Label(LocalizedStringKey(c.archived == true ? "console.customers.restore" : "console.customers.archive"),
                              systemImage: c.archived == true ? "tray.and.arrow.up" : "archivebox")
                    }
                }
            }
            if let message { Section { Text(message).foregroundColor(Theme.danger) } }
        }
        .confirmationDialog("console.customers.archive_title", isPresented: $confirmArchive, titleVisibility: .visible) {
            Button("console.customers.archive", role: .destructive) { Task { await archive(c) } }
            Button("common.cancel", role: .cancel) {}
        } message: {
            Text("console.customers.archive_message \(c.name)")
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button(LocalizedStringKey("console.customers.edit")) { showEdit = true } }
        }
        .sheet(isPresented: $showEdit) {
            CustomerFormSheet(customer: c) { _ in store.changed() }
        }
        .sheet(isPresented: $showWalkIn) {
            WalkInSheet(preset: c) { code in open = JobRef(id: code) }
        }
    }

    private func load() async {
        do { state = .loaded(try await store.repo.customer(id: customerId)) }
        catch { state = .failed(error.localizedDescription) }
    }

    private func archive(_ c: Customer) async {
        do {
            _ = try await store.repo.archiveCustomer(id: c.id, archived: c.archived != true)
            store.changed()
        } catch { message = error.localizedDescription }
    }
}

struct CustomerFormSheet: View {
    let customer: Customer?
    var onSaved: (Customer) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var store: OwnerStore
    @State private var input = CustomerInput()
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section { CustomerFields(input: $input) }
                Section("console.customer.company") {
                    TextField("console.customer.company_name", text: Binding(get: { input.company.name ?? "" }, set: { input.company.name = $0 }))
                    TextField("CUI", text: Binding(get: { input.company.cui ?? "" }, set: { input.company.cui = $0 }))
                    TextField("Reg. Com.", text: Binding(get: { input.company.regCom ?? "" }, set: { input.company.regCom = $0 }))
                }
                Section {
                    TextField("console.customer.address", text: $input.address)
                    TextField("console.customer.notes", text: $input.notes, axis: .vertical).lineLimit(2...6)
                }
                if let error { Section { Text(error).foregroundColor(Theme.danger) } }
            }
            .navigationTitle(LocalizedStringKey(customer == nil ? "console.customers.new" : "console.customers.edit"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(LocalizedStringKey("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(LocalizedStringKey("common.save")) { Task { await save() } }.disabled(saving || input.name.count < 2)
                }
            }
            .onAppear { if let customer { input = CustomerInput(customer) } }
        }
    }

    private func save() async {
        saving = true
        do {
            let saved = customer == nil
                ? try await store.repo.createCustomer(input)
                : try await store.repo.updateCustomer(id: customer!.id, input: input)
            onSaved(saved)
            dismiss()
        } catch APIError.conflict(let code) where code == "customer_exists" {
            error = String(localized: "console.walkin.customer_exists")
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}
