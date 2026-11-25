import SwiftUI

/// New booking, in one scrolling form: what, where, when, who. Same fields and rules as the website.
struct BookingFlowView: View {
    @EnvironmentObject var api: APIClient
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            BookingForm(model: BookingModel(api: api)) { dismiss() }
                .navigationTitle(LocalizedStringKey("booking.title"))
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct BookingForm: View {
    @StateObject var model: BookingModel
    let close: () -> Void
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var apiClient: APIClient

    init(model: @autoclosure @escaping () -> BookingModel, close: @escaping () -> Void) {
        _model = StateObject(wrappedValue: model())
        self.close = close
    }

    var body: some View {
        Group {
            if let code = model.bookedCode {
                BookedView(code: code, signedIn: auth.isSignedIn, close: close)
            } else {
                form
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if model.bookedCode == nil { Button(LocalizedStringKey("common.close"), action: close) }
            }
        }
        .task {
            model.prefill(from: auth.viewer)
            await model.loadTaken()
        }
    }

    private var form: some View {
        Form {
            Section {
                Picker("booking.kind.label", selection: $model.kind) {
                    ForEach(BookingModel.Kind.allCases) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                Text(loc("booking.kind.hint.\(model.kind.rawValue)"))
                    .font(.footnote).foregroundColor(.secondary)
            }

            Section("booking.section.what") {
                NavigationLink {
                    JobPicker(model: model)
                } label: {
                    HStack {
                        Text("booking.jobs")
                        Spacer()
                        Text("\(model.jobIDs.count)").foregroundColor(.secondary)
                    }
                }
                TextField("booking.custom", text: $model.custom, axis: .vertical).lineLimit(1...3).limited($model.custom, to: BookingModel.Limit.custom)
                TextField("booking.brand", text: $model.brand).limited($model.brand, to: BookingModel.Limit.device)
                TextField("booking.model", text: $model.model).limited($model.model, to: BookingModel.Limit.device)
                if model.needsYear { TextField("booking.year", text: $model.year).keyboardType(.numberPad).limited($model.year, to: BookingModel.Limit.device) }
                TextField("booking.issue", text: $model.issue, axis: .vertical).lineLimit(2...6).limited($model.issue, to: BookingModel.Limit.issue)
                if model.usesValue {
                    Picker("booking.value", selection: $model.value) {
                        Text("booking.value.unknown").tag(DeviceValue?.none)
                        ForEach(DeviceValue.allCases) { Text(LocalizedStringKey($0.titleKey)).tag(DeviceValue?.some($0)) }
                    }
                }
            }

            whereSection

            Section("booking.section.when") {
                daysStrip
                slotsGrid
            }

            Section {
                TextField("booking.name", text: $model.name).textContentType(.name).limited($model.name, to: BookingModel.Limit.name)
                TextField("booking.phone", text: $model.phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
                TextField("booking.email", text: $model.email).textContentType(.emailAddress).keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
            } header: { Text("booking.section.you") } footer: {
                if !model.phone.isEmpty, !model.phoneOK { Text("booking.error.phone").foregroundColor(Theme.danger) }
                else if !model.emailOK { Text("auth.error.email").foregroundColor(Theme.danger) }
            }

            summary
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("common.done") {
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                }
            }
        }
    }

    // MARK: - Where

    @ViewBuilder
    private var whereSection: some View {
        if model.kind == .pickup {
            Section {
                TextField("booking.address", text: $model.addressQuery)
                    .textContentType(.fullStreetAddress)
                    .onChange(of: model.addressQuery) { _, new in
                        if new != model.place?.label { model.place = nil; model.quote = nil }
                    }
                    .task(id: model.addressQuery) { await model.search() }
                if model.searching { ProgressView() }
                ForEach(model.places, id: \.self) { p in
                    Button { model.choose(p) } label: {
                        Label(p.label, systemImage: "mappin.circle.fill").foregroundColor(.primary)
                    }
                }
                Picker("booking.trips", selection: $model.trips) {
                    ForEach(BookingModel.Trips.allCases) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
                }
                .onChange(of: model.trips) { _, _ in Task { await model.loadQuote() } }
                Toggle("booking.urgent", isOn: $model.urgent)
                    .onChange(of: model.urgent) { _, _ in Task { await model.loadQuote(); await model.loadTaken() } }
                quoteRow
            } header: { Text("booking.section.pickup") }
        } else if model.kind == .mobile {
            Section("booking.section.location") {
                TextField("booking.location", text: $model.location, axis: .vertical).lineLimit(1...3).limited($model.location, to: BookingModel.Limit.location)
            }
        }
    }

    @ViewBuilder
    private var quoteRow: some View {
        if model.quoting {
            ProgressView()
        } else if let quote = model.quote {
            if quote.tooFar {
                Label("booking.too_far", systemImage: "exclamationmark.triangle.fill").foregroundColor(Theme.danger)
            } else {
                LabeledContent("booking.transport") { Text("\(Int(quote.totalLei)) lei") }
            }
        } else if model.quoteFailed {
            Label("booking.quote_failed", systemImage: "wifi.exclamationmark").foregroundColor(Theme.danger)
        }
    }

    // MARK: - When

    /// The system calendar, in the shop's time zone so a date means the same day for everyone.
    private var daysStrip: some View {
        VStack(alignment: .leading, spacing: 6) {
            DatePicker(
                "booking.date",
                selection: Binding(get: { ShopCalendar.date(model.day) }, set: { model.pick(date: $0) }),
                in: model.dateRange,
                displayedComponents: .date
            )
            .datePickerStyle(.compact)
            .environment(\.timeZone, ShopCalendar.timeZone)
            .environment(\.calendar, ShopCalendar.calendar)
            if model.dayMovedNote {
                Text("booking.day_closed").font(.footnote).foregroundColor(.secondary)
            }
        }
    }

    @ViewBuilder
    private var slotsGrid: some View {
        if model.slotsFailed {
            Label("booking.slots_failed", systemImage: "wifi.exclamationmark").foregroundColor(Theme.danger)
            Button("common.retry") { Task { await model.loadTaken() } }
        } else if model.slots.isEmpty {
            Text("booking.no_slots").foregroundColor(.secondary)
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 8)], spacing: 8) {
                ForEach(model.slots) { s in
                    Button { model.slot = s } label: {
                        Text(s.label).font(.subheadline.monospacedDigit())
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(model.slot == s ? Color.accentColor : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .foregroundColor(model.slot == s ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(model.slot == s ? .isSelected : [])
                }
            }
            .padding(.vertical, 4)
            if model.kind == .mobile { Text("booking.window_note").font(.footnote).foregroundColor(.secondary) }
        }
    }

    // MARK: - Summary

    private var summary: some View {
        Section {
            let e = model.estimate
            LabeledContent("booking.estimate") {
                if e.to > 0 { Text("\(Int(e.from))–\(Int(e.to)) lei") } else { Text("booking.price.after_diagnosis") }
            }
            if let t = model.transportLei { LabeledContent("booking.transport") { Text("\(Int(t)) lei") } }
            if e.partsExtra { Text("booking.parts_extra").font(.footnote).foregroundColor(.secondary) }
            if e.needsDiagnosis { Text("booking.needs_diagnosis").font(.footnote).foregroundColor(.secondary) }
            if let problem = model.problem {
                Label(LocalizedStringKey(problem), systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote).foregroundColor(Theme.danger)
            }
            Button {
                Task { await model.submit() }
            } label: {
                HStack {
                    if model.submitting { ProgressView().tint(.white) }
                    Text("booking.submit").font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!model.canSubmit)
            .listRowBackground(Color.clear)
        } footer: {
            Text("booking.confirm_note")
        }
    }
}

/// Multi-select price list for one kind of visit, grouped like the website.
private struct JobPicker: View {
    @ObservedObject var model: BookingModel
    @State private var text = ""

    private var groups: [(String, [CatalogJob])] {
        let needle = text.lowercased()
        let jobs = model.availableJobs.filter { needle.isEmpty || $0.name.text.lowercased().contains(needle) }
        return Catalog.categoryOrder.compactMap { c in
            let items = jobs.filter { $0.category == c }
            return items.isEmpty ? nil : (c, items)
        }
    }

    var body: some View {
        List {
            ForEach(groups, id: \.0) { category, jobs in
                Section(loc("booking.category.\(category)")) {
                    ForEach(jobs) { job in
                        Button {
                            if model.jobIDs.contains(job.id) { model.jobIDs.remove(job.id) } else if model.canAddJob { model.jobIDs.insert(job.id) }
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: model.jobIDs.contains(job.id) ? "checkmark.circle.fill" : "circle")
                                    .foregroundColor(model.jobIDs.contains(job.id) ? .accentColor : .secondary)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(job.name.text).foregroundColor(.primary)
                                    Text(job.description.text).font(.footnote).foregroundColor(.secondary)
                                    Text(priceText(job)).font(.footnote.bold()).foregroundColor(Theme.shop)
                                }
                            }
                        }
                        .accessibilityAddTraits(model.jobIDs.contains(job.id) ? .isSelected : [])
                    }
                }
            }
        }
        .navigationTitle(LocalizedStringKey("booking.jobs"))
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $text)
        .safeAreaInset(edge: .bottom) {
            if !model.canAddJob {
                Text("booking.jobs_max").font(.footnote.bold()).padding(8).glassCard(radius: 12).padding(.bottom, 8)
            }
        }
    }

    private func priceText(_ job: CatalogJob) -> String {
        let (from, to) = job.price(for: nil)
        if from == to { return "\(Int(from)) lei" }
        return "\(Int(from))–\(Int(to)) lei"
    }
}

/// Shown after the booking went through.
private struct BookedView: View {
    let code: String
    let signedIn: Bool
    let close: () -> Void
    @State private var copied = false

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: "checkmark.circle.fill").font(.system(size: 64)).foregroundColor(Theme.ok)
            Text("booking.done.title").font(.title2.bold())
            Text(code).font(.system(.largeTitle, design: .monospaced).bold())
                .padding(.horizontal, 20).padding(.vertical, 10)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .textSelection(.enabled)
            Text(LocalizedStringKey(signedIn ? "booking.done.signed_in" : "booking.done.guest"))
                .font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
            Button {
                UIPasteboard.general.string = code
                copied = true
            } label: {
                Label(LocalizedStringKey(copied ? "booking.done.copied" : "booking.done.copy"), systemImage: copied ? "checkmark" : "doc.on.doc")
            }
            .buttonStyle(.bordered)
            Spacer()
            Button(action: close) {
                Text("common.close").font(.headline).frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .navigationBarBackButtonHidden()
    }
}

extension View {
    /// Stops text at a length the server accepts, so a long paste cannot make the booking fail later.
    func limited(_ text: Binding<String>, to length: Int) -> some View {
        onChange(of: text.wrappedValue) { _, new in
            if new.count > length { text.wrappedValue = String(new.prefix(length)) }
        }
    }
}
