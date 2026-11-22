import SwiftUI

/// A customer walks in with a device: pick or create the customer, fill the service sheet, open the job.
struct WalkInSheet: View {
    var preset: Customer?
    var onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var store: OwnerStore

    private enum Who: Hashable { case existing, new }

    @State private var who: Who = .existing
    @State private var search = ""
    @State private var found: [Customer] = []
    @State private var picked: Customer?
    @State private var customer = CustomerInput()
    @State private var input = WalkInInput()
    @State private var from = ""
    @State private var to = ""
    @State private var saving = false
    @State private var error: String?

    init(preset: Customer? = nil, onCreated: @escaping (String) -> Void) {
        self.preset = preset
        self.onCreated = onCreated
    }

    private var canSave: Bool {
        let hasCustomer = who == .existing ? picked != nil : customer.name.trimmingCharacters(in: .whitespaces).count >= 2
        return hasCustomer
            && input.intake.deviceType.trimmingCharacters(in: .whitespaces).count >= 2
            && input.issue.trimmingCharacters(in: .whitespaces).count >= 3
            && !saving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("console.walkin.customer") {
                    Picker("", selection: $who) {
                        Text("console.walkin.existing").tag(Who.existing)
                        Text("console.walkin.new_customer").tag(Who.new)
                    }
                    .pickerStyle(.segmented)

                    if who == .existing {
                        if let picked {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(picked.name).font(.headline)
                                    Text(picked.phone ?? picked.email ?? "").font(.caption).foregroundColor(.secondary)
                                }
                                Spacer()
                                Button("console.walkin.change") { self.picked = nil }
                            }
                        } else {
                            TextField("console.customers.search", text: $search)
                            ForEach(found) { c in
                                Button {
                                    picked = c
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(c.name).foregroundColor(.primary)
                                        Text(c.phone ?? c.email ?? "").font(.caption).foregroundColor(.secondary)
                                    }
                                }
                            }
                        }
                    } else {
                        CustomerFields(input: $customer)
                    }
                }

                Section("console.walkin.device") {
                    TextField("console.intake.device_type", text: $input.intake.deviceType)
                    TextField("console.walkin.brand", text: $input.brand)
                    TextField("console.walkin.model", text: $input.model)
                    TextField("console.intake.serial", text: $input.intake.serial)
                    TextField("console.intake.accessories", text: $input.intake.accessories, axis: .vertical).lineLimit(1...3)
                    TextField("console.intake.appearance", text: $input.intake.appearance, axis: .vertical).lineLimit(1...4)
                }

                Section("console.walkin.problem") {
                    TextField("console.walkin.issue", text: $input.issue, axis: .vertical).lineLimit(2...6)
                    HStack {
                        TextField("console.walkin.price_from", text: $from).keyboardType(.numberPad)
                        Text("–")
                        TextField("console.walkin.price_to", text: $to).keyboardType(.numberPad)
                        Text("lei").foregroundColor(.secondary)
                    }
                }

                Section {
                    Toggle("console.intake.email", isOn: $input.intake.email)
                } footer: {
                    Text("console.walkin.email_hint")
                }

                if let error { Section { Text(error).foregroundColor(Theme.danger) } }
            }
            .navigationTitle(LocalizedStringKey("console.walkin.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(LocalizedStringKey("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(LocalizedStringKey("console.walkin.create")) { Task { await create() } }.disabled(!canSave)
                }
            }
            .task { if let preset, picked == nil { picked = preset } }
            .task(id: search) {
                try? await Task.sleep(nanoseconds: 250_000_000)
                guard !Task.isCancelled else { return }
                found = (try? await store.repo.customers(text: search, archived: false, limit: 8, skip: 0).items) ?? []
            }
        }
    }

    private func create() async {
        saving = true
        error = nil
        input.priceFrom = Int(from.filter(\.isNumber)) ?? 0
        input.priceTo = max(input.priceFrom, Int(to.filter(\.isNumber)) ?? 0)
        input.lang = Locale.current.language.languageCode?.identifier == "en" ? "en" : "ro"
        if who == .existing {
            input.customerId = picked?.id
            input.customer = nil
        } else {
            input.customerId = nil
            input.customer = customer
        }
        do {
            let booking = try await store.repo.walkIn(input)
            store.changed()
            dismiss()
            onCreated(booking.code)
        } catch APIError.conflict(let code) where code == "customer_exists" {
            error = String(localized: "console.walkin.customer_exists")
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

/// Fields shared by the new-customer form and the walk-in sheet.
struct CustomerFields: View {
    @Binding var input: CustomerInput

    var body: some View {
        TextField("console.customer.name", text: $input.name)
        TextField("console.customer.phone", text: $input.phone).keyboardType(.phonePad)
        TextField("Email", text: $input.email).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
        Picker("console.customer.preferred", selection: $input.preferred) {
            ForEach(ContactChannel.allCases) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
        }
    }
}
