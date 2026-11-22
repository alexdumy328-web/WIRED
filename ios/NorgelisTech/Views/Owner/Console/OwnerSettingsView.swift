import SwiftUI

/// Owner-only: transport and labour rates, company details for documents, warranty lengths and terms.
struct OwnerSettingsView: View {
    @EnvironmentObject var store: OwnerStore

    @State private var state: LoadState<ShopSettings> = .loading
    @State private var draft: ShopSettings?
    @State private var saving = false
    @State private var message: String?
    @State private var messageIsError = false

    private let categories = ["laptop", "pc", "board", "coffee", "appliance", "it", "vintage", "auto", "custom"]

    var body: some View {
        Group {
            switch state {
            case .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let text): ErrorBanner(message: text) { Task { await load() } }
            case .loaded: if draft != nil { form } 
            }
        }
        .navigationTitle(LocalizedStringKey("console.settings.title"))
        .task { await load() }
    }

    private var form: some View {
        let d = Binding(get: { draft! }, set: { draft = $0 })
        return Form {
            Section("console.settings.pickup") {
                NumberRow("console.settings.diesel", "lei/L", d.pickup.dieselLeiPerL)
                NumberRow("console.settings.consumption", "L/100 km", d.pickup.consumptionLPer100)
                NumberRow("console.settings.driver_hour", "lei/h", d.pickup.driverLeiPerHour)
                NumberRow("console.settings.stop_minutes", "min", d.pickup.stopMinutes)
                NumberRow("console.settings.min_trip", "lei", d.pickup.minTripLei)
                NumberRow("console.settings.urgent_factor", "×", d.pickup.urgentFactor)
                NumberRow("console.settings.max_km", "km", d.pickup.maxKm)
            }
            Section("console.settings.labour") {
                NumberRow("console.settings.rate_low", "lei/h", d.labour.valueRate.low)
                NumberRow("console.settings.rate_mid", "lei/h", d.labour.valueRate.mid)
                NumberRow("console.settings.rate_high", "lei/h", d.labour.valueRate.high)
                NumberRow("console.settings.rate_premium", "lei/h", d.labour.valueRate.premium)
                NumberRow("console.settings.cons_low", "×", d.labour.consumablesFactor.low)
                NumberRow("console.settings.cons_medium", "×", d.labour.consumablesFactor.medium)
                NumberRow("console.settings.cons_high", "×", d.labour.consumablesFactor.high)
            }
            Section("console.settings.company") {
                TextField("console.settings.company_name", text: d.company.name)
                TextField("CUI", text: d.company.cui)
                TextField("Reg. Com.", text: d.company.regCom)
                TextField("console.customer.address", text: d.company.address)
                TextField("console.customer.phone", text: d.company.phone)
                TextField("Email", text: d.company.email).textInputAutocapitalization(.never)
                TextField("IBAN", text: d.company.iban).textInputAutocapitalization(.characters)
                TextField("console.settings.bank", text: d.company.bank)
            }
            Section("console.settings.warranty_months") {
                ForEach(categories, id: \.self) { key in
                    Stepper(value: Binding(get: { d.wrappedValue.documents.warrantyMonths[key] ?? 0 }, set: { d.wrappedValue.documents.warrantyMonths[key] = $0 }), in: 0...60) {
                        HStack {
                            Text(loc("console.stats.cat.\(key)"))
                            Spacer()
                            Text("\(d.wrappedValue.documents.warrantyMonths[key] ?? 0)").monospacedDigit().foregroundColor(.secondary)
                        }
                    }
                }
            }
            Section("console.settings.terms") {
                TextField("console.settings.intake_terms", text: d.documents.intakeTerms, axis: .vertical).lineLimit(3...10)
                TextField("console.settings.warranty_terms", text: d.documents.warrantyTerms, axis: .vertical).lineLimit(3...10)
            }
            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack {
                        if saving { ProgressView().padding(.trailing, 4) }
                        Text("console.settings.save")
                    }
                }
                .disabled(saving || draft == state.value)
                if let message {
                    Label(message, systemImage: messageIsError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                        .font(.footnote).foregroundColor(messageIsError ? Theme.danger : Theme.ok)
                }
                if let at = draft?.updatedAt {
                    Text("console.settings.updated \(ShopCalendar.dateTime(at))").font(.caption).foregroundColor(.secondary)
                }
            }
        }
    }

    private func load() async {
        do {
            let s = try await store.repo.settings()
            state = .loaded(s)
            draft = s
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func save() async {
        guard let draft else { return }
        saving = true
        do {
            let saved = try await store.repo.saveSettings(draft)
            state = .loaded(saved)
            self.draft = saved
            messageIsError = false
            message = String(localized: "console.settings.saved")
        } catch {
            messageIsError = true
            message = error.localizedDescription
        }
        saving = false
    }
}

/// A labelled number field with a unit.
struct NumberRow: View {
    let title: LocalizedStringKey
    let unit: String
    @Binding var value: Double

    init(_ title: LocalizedStringKey, _ unit: String, _ value: Binding<Double>) {
        self.title = title
        self.unit = unit
        self._value = value
    }

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            TextField("0", value: $value, format: .number.precision(.fractionLength(0...2)))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 90)
            Text(unit).foregroundColor(.secondary).frame(minWidth: 44, alignment: .leading)
        }
    }
}
