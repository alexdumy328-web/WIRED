import SwiftUI
import EventKit
import EventKitUI

/// New booking, in one scrolling form: what, where, when, who. Same fields and rules as the website.
struct BookingFlowView: View {
    @EnvironmentObject var api: APIClient
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    /// Phone from a returning customer's previous booking, if available.
    var knownPhone: String? = nil
    /// Called when the customer taps "Track this booking" on the confirmation screen.
    var onTrack: ((String) -> Void)? = nil

    var body: some View {
        NavigationStack {
            BookingForm(model: BookingModel(api: api), knownPhone: knownPhone, close: { dismiss() }, onTrack: onTrack)
                .navigationTitle(LocalizedStringKey("booking.title"))
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct BookingForm: View {
    @StateObject var model: BookingModel
    let knownPhone: String?
    let close: () -> Void
    let onTrack: ((String) -> Void)?
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var apiClient: APIClient
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @FocusState private var focusedField: Field?
    @State private var phoneTouched = false
    @State private var emailTouched = false
    @State private var showMissing = false
    @State private var confirmDiscard = false

    private enum Field { case custom, brand, model, year, issue, address, location, name, phone, email }

    init(model: @autoclosure @escaping () -> BookingModel, knownPhone: String?, close: @escaping () -> Void, onTrack: ((String) -> Void)?) {
        _model = StateObject(wrappedValue: model())
        self.knownPhone = knownPhone
        self.close = close
        self.onTrack = onTrack
    }

    var body: some View {
        Group {
            if let code = model.bookedCode {
                BookedView(code: code, summary: model.bookedSummary, signedIn: auth.isSignedIn, onTrack: onTrack, close: close)
            } else {
                form
            }
        }
        .interactiveDismissDisabled(model.hasEdits)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                if model.bookedCode == nil {
                    Button(LocalizedStringKey("common.close")) {
                        if model.hasEdits { confirmDiscard = true } else { close() }
                    }
                }
            }
        }
        .confirmationDialog("booking.discard.title", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("booking.discard.confirm", role: .destructive, action: close)
            Button("booking.discard.keep", role: .cancel) {}
        } message: {
            Text("booking.discard.message")
        }
        .task {
            model.prefill(from: auth.viewer, knownPhone: knownPhone)
            await model.loadTaken()
        }
    }

    private var form: some View {
        ScrollViewReader { proxy in
            Form {
                Section {
                    if dynamicTypeSize.isAccessibilitySize {
                        Picker("booking.kind.label", selection: $model.kind) {
                            ForEach(BookingModel.Kind.allCases) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
                        }
                        .pickerStyle(.inline)
                    } else {
                        Picker("booking.kind.label", selection: $model.kind) {
                            ForEach(BookingModel.Kind.allCases) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                    }
                    Text(loc(kindHintKey))
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
                    ForEach(model.selectedJobs) { job in
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(job.name.text).font(.subheadline)
                                let p = job.price(for: model.value)
                                Text(Money.range(p.from, p.to)).font(.caption).foregroundColor(.secondary)
                            }
                            Spacer(minLength: 4)
                            Button {
                                model.jobIDs.remove(job.id)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                                    .frame(minWidth: 36, minHeight: 36)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Text("booking.remove_job \(job.name.text)"))
                        }
                    }
                    TextField("booking.custom", text: $model.custom, axis: .vertical).lineLimit(1...3)
                        .focused($focusedField, equals: .custom).limited($model.custom, to: BookingModel.Limit.custom)
                    TextField("booking.brand", text: $model.brand)
                        .focused($focusedField, equals: .brand).limited($model.brand, to: BookingModel.Limit.device)
                    TextField("booking.model", text: $model.model)
                        .focused($focusedField, equals: .model).limited($model.model, to: BookingModel.Limit.device)
                    if model.needsYear {
                        TextField("booking.year", text: $model.year).keyboardType(.numberPad)
                            .focused($focusedField, equals: .year).limited($model.year, to: BookingModel.Limit.device)
                    }
                    TextField("booking.issue", text: $model.issue, axis: .vertical).lineLimit(2...6)
                        .focused($focusedField, equals: .issue).limited($model.issue, to: BookingModel.Limit.issue)
                    if model.usesValue {
                        Picker("booking.value", selection: $model.value) {
                            Text("booking.value.unknown").tag(DeviceValue?.none)
                            ForEach(DeviceValue.allCases) { Text(LocalizedStringKey($0.titleKey)).tag(DeviceValue?.some($0)) }
                        }
                    }
                }
                .id("what")

                whereSection
                    .id("where")

                Section("booking.section.when") {
                    daysStrip
                    slotsGrid
                }
                .id("when")

                Section {
                    TextField("booking.name", text: $model.name).textContentType(.name)
                        .focused($focusedField, equals: .name).submitLabel(.next).onSubmit { focusedField = .phone }
                        .limited($model.name, to: BookingModel.Limit.name)
                    TextField("booking.phone", text: $model.phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
                        .focused($focusedField, equals: .phone)
                    TextField("booking.email", text: $model.email).textContentType(.emailAddress).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($focusedField, equals: .email).submitLabel(.done).onSubmit { focusedField = nil }
                } header: { Text("booking.section.you") } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        if (phoneTouched || showMissing), !model.phone.isEmpty, !model.phoneOK {
                            Text("booking.error.phone").foregroundColor(Theme.danger)
                        } else if (emailTouched || showMissing), !model.emailOK {
                            Text("auth.error.email").foregroundColor(Theme.danger)
                        }
                        if !auth.isSignedIn {
                            Text("booking.email.guest_note").foregroundColor(.secondary)
                        }
                    }
                }
                .id("you")
                .onChange(of: focusedField) { old, _ in
                    if old == .phone { phoneTouched = true }
                    if old == .email { emailTouched = true }
                }

                summary(scrollProxy: proxy)
            }
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("common.done") { focusedField = nil }
                }
            }
        }
    }

    private var kindHintKey: String {
        if model.kind == .pickup && model.trips == .dropoff {
            return "booking.kind.hint.dropoff"
        }
        return "booking.kind.hint.\(model.kind.rawValue)"
    }

    // MARK: - Where

    @ViewBuilder
    private var whereSection: some View {
        if model.kind == .pickup {
            Section {
                TextField(LocalizedStringKey(model.trips == .dropoff ? "booking.address.dropoff" : "booking.address"), text: $model.addressQuery)
                    .textContentType(.fullStreetAddress)
                    .focused($focusedField, equals: .address)
                    .onChange(of: model.addressQuery) { _, new in
                        if new != model.place?.label {
                            model.place = nil
                            model.quote = nil
                            model.quoteFailed = false
                        }
                    }
                    .task(id: model.addressQuery) { await model.search() }
                if model.searching { ProgressView() }
                if model.searchFailed {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("booking.address.search_failed", systemImage: "wifi.exclamationmark")
                            .font(.footnote).foregroundColor(Theme.danger)
                        Button("common.retry") { Task { await model.search() } }.font(.footnote.bold())
                    }
                } else if !model.places.isEmpty && model.place == nil {
                    Text("booking.address.pick_hint").font(.caption).foregroundColor(.secondary)
                } else if model.searchDone && model.places.isEmpty && model.place == nil {
                    Text("booking.address.no_results").font(.footnote).foregroundColor(.secondary)
                }
                ForEach(model.places, id: \.self) { p in
                    Button { model.choose(p); focusedField = nil } label: {
                        Label(p.label, systemImage: "mappin.circle.fill").foregroundColor(.primary)
                    }
                }
                Picker("booking.trips", selection: $model.trips) {
                    ForEach(BookingModel.Trips.allCases) { Text(LocalizedStringKey($0.titleKey)).tag($0) }
                }
                .onChange(of: model.trips) { _, _ in Task { await model.loadQuote() } }
                Toggle("booking.urgent", isOn: $model.urgent)
                    .disabled(!model.urgentAvailableToday)
                    .onChange(of: model.urgent) { _, _ in Task { await model.loadQuote(); await model.loadTaken() } }
                if !model.urgentAvailableToday {
                    Text("booking.urgent.unavailable_today").font(.caption).foregroundColor(.secondary)
                }
                quoteRow
            } header: { Text("booking.section.pickup") }
        } else if model.kind == .mobile {
            Section("booking.section.location") {
                TextField("booking.location", text: $model.location, axis: .vertical).lineLimit(1...3)
                    .focused($focusedField, equals: .location).limited($model.location, to: BookingModel.Limit.location)
            }
        }
    }

    @ViewBuilder
    private var quoteRow: some View {
        if model.quoting {
            ProgressView()
        } else if let quote = model.quote {
            if quote.tooFar {
                VStack(alignment: .leading, spacing: 8) {
                    Label("booking.too_far", systemImage: "exclamationmark.triangle.fill").foregroundColor(Theme.danger)
                    if let phone = Shop.phone, let url = Shop.telURL(phone) {
                        Button { openURL(url) } label: {
                            Label("contact.call", systemImage: "phone.fill").font(.subheadline.bold())
                        }
                        .buttonStyle(.bordered)
                    }
                }
            } else {
                LabeledContent("booking.transport") { Text(Money.lei(quote.totalLei)) }
            }
        } else if model.quoteFailed {
            VStack(alignment: .leading, spacing: 8) {
                Label("booking.quote_failed", systemImage: "wifi.exclamationmark").foregroundColor(Theme.danger)
                Button("common.retry") { Task { await model.loadQuote() } }.font(.subheadline.bold())
            }
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
        if model.slotsLoading && model.taken.isEmpty {
            HStack(spacing: 8) {
                ProgressView()
                Text("common.loading").font(.footnote).foregroundColor(.secondary)
            }
            .padding(.vertical, 6)
        } else if model.slotsFailed {
            Label("booking.slots_failed", systemImage: "wifi.exclamationmark").foregroundColor(Theme.danger)
            Button("common.retry") { Task { await model.loadTaken() } }
        } else if model.slots.isEmpty {
            Text("booking.no_slots").foregroundColor(.secondary)
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 8)], spacing: 8) {
                ForEach(model.slots) { s in
                    Button { model.slot = s } label: {
                        Text(s.label).font(.subheadline.monospacedDigit())
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(model.slot == s ? Color.accentColor : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .foregroundColor(model.slot == s ? Theme.onAccent : .primary)
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

    private func summary(scrollProxy: ScrollViewProxy) -> some View {
        Section {
            let e = model.estimate
            LabeledContent("booking.estimate") {
                if e.to > 0 { Text(Money.range(e.from, e.to)) } else { Text("booking.price.after_diagnosis") }
            }
            if let eta = Money.eta(e.etaHours) {
                LabeledContent("booking.eta.label", value: eta)
            }
            if let t = model.transportLei { LabeledContent("booking.transport") { Text(Money.lei(t)) } }
            if e.partsExtra { Text("booking.parts_extra").font(.footnote).foregroundColor(.secondary) }
            if e.needsDiagnosis { Text("booking.needs_diagnosis").font(.footnote).foregroundColor(.secondary) }
            Text("booking.payment_note").font(.footnote).foregroundColor(.secondary)

            let missing = model.missingItems
            if !missing.isEmpty && (showMissing || model.hasEdits) {
                Label {
                    Text("booking.missing.prefix \(missing.map(\.label).joined(separator: ", "))")
                        .font(.footnote)
                } icon: {
                    Image(systemName: showMissing ? "exclamationmark.circle.fill" : "info.circle")
                }
                .foregroundColor(showMissing ? Theme.danger : .secondary)
            }

            if let problem = model.problem {
                Label(LocalizedStringKey(problem), systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote).foregroundColor(Theme.danger)
            }

            Button {
                if model.canSubmit {
                    Task { await model.submit() }
                } else {
                    showMissing = true
                    phoneTouched = true
                    emailTouched = true
                    if let first = missing.first {
                        withAnimation { scrollProxy.scrollTo(first.section, anchor: .top) }
                    }
                }
            } label: {
                HStack {
                    if model.submitting { ProgressView().tint(Theme.onAccent) }
                    Text("booking.submit").font(.headline)
                }
                .foregroundStyle(Theme.onAccent)
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .opacity(model.isComplete ? 1 : 0.65)
            .disabled(model.submitting)
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
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(job.name.text).foregroundColor(.primary)
                                    Text(job.description.text).font(.footnote).foregroundColor(.secondary)
                                    Text(priceText(job)).font(.footnote.bold()).foregroundColor(Theme.shop)
                                }
                            }
                        }
                        .accessibilityElement(children: .combine)
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
        let (from, to) = job.price(for: model.value)
        return Money.range(from, to)
    }
}

/// Shown after the booking went through: compact recap, Track CTA, Add to Calendar, and copy code.
private struct BookedView: View {
    let code: String
    let summary: BookedSummary?
    let signedIn: Bool
    let onTrack: ((String) -> Void)?
    let close: () -> Void
    @State private var copied = false
    @State private var showCalendar = false

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 60)).foregroundColor(Theme.ok)
                    .padding(.top, 12)
                    .accessibilityHidden(true)
                Text("booking.done.title").font(.title2.bold())
                Text(code).font(.system(.largeTitle, design: .monospaced).bold())
                    .padding(.horizontal, 20).padding(.vertical, 10)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .textSelection(.enabled)
                Text(LocalizedStringKey(signedIn ? "booking.done.signed_in" : "booking.done.guest"))
                    .font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)

                if let summary {
                    VStack(alignment: .leading, spacing: 8) {
                        LabeledContent("customer.booking.date", value: summary.slotText)
                        LabeledContent("booking.done.where", value: summary.locationText)
                        LabeledContent("booking.estimate", value: summary.estimateText)
                        if let transport = summary.transportText {
                            LabeledContent("booking.transport", value: transport)
                        }
                    }
                    .font(.subheadline)
                    .padding(14)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                    if !signedIn && !summary.hasEmail {
                        Label("booking.done.no_email_warn", systemImage: "info.circle")
                            .font(.footnote).foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                HStack(spacing: 10) {
                    Button {
                        UIPasteboard.general.string = code
                        copied = true
                    } label: {
                        Label(LocalizedStringKey(copied ? "booking.done.copied" : "booking.done.copy"), systemImage: copied ? "checkmark" : "doc.on.doc")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)

                    if summary != nil {
                        Button { showCalendar = true } label: {
                            Label("booking.done.calendar", systemImage: "calendar.badge.plus")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                    }
                }

                if let onTrack {
                    Button {
                        onTrack(code)
                    } label: {
                        Label("booking.done.track", systemImage: "location.magnifyingglass")
                            .font(.headline).foregroundStyle(Theme.onAccent)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)

                    Button(action: close) {
                        Text("common.close").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button(action: close) {
                        Text("common.close").font(.headline).foregroundStyle(Theme.onAccent).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(24)
        }
        .navigationBarBackButtonHidden()
        .sheet(isPresented: $showCalendar) {
            if let summary {
                CalendarEventSheet(summary: summary)
            }
        }
    }
}

/// Native iOS "New Event" sheet for adding a booked appointment to Calendar.
private struct CalendarEventSheet: UIViewControllerRepresentable {
    let summary: BookedSummary
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(dismiss: dismiss) }

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        event.title = "Norgelis Tech — \(summary.code)"
        event.startDate = summary.slotStart
        event.endDate = summary.slotStart.addingTimeInterval(TimeInterval(summary.slotDurationHours * 3600))
        event.location = summary.locationText
        event.notes = "\(summary.code) · \(summary.estimateText)"
        let controller = EKEventEditViewController()
        controller.eventStore = store
        controller.event = event
        controller.editViewDelegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: EKEventEditViewController, context: Context) {}

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let dismiss: DismissAction
        init(dismiss: DismissAction) { self.dismiss = dismiss }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
            dismiss()
        }
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
