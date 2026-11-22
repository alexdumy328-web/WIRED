import SwiftUI
import UIKit

/// A job opened from anywhere: wraps the detail in its own navigation and a Close button.
struct BookingDetailSheet: View {
    let code: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            BookingDetailView(code: code)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(LocalizedStringKey("common.close")) { dismiss() }
                    }
                }
        }
    }
}

struct ShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// The work order: status, notes, price, service sheet, customer, pickup, warranty and history.
struct BookingDetailView: View {
    let code: String
    @EnvironmentObject var store: OwnerStore

    @State private var state: LoadState<BookingDetail> = .loading

    // Edits
    @State private var status: BookingStatus = .received
    @State private var note = ""
    @State private var notify = true
    @State private var price = ""
    @State private var diagnosis = ""
    @State private var workDone = ""
    @State private var partsUsed = ""

    @State private var saving = false
    @State private var message: String?
    @State private var messageIsError = false
    @State private var showIntake = false
    @State private var showWarranty = false
    @State private var share: ShareItem?

    var body: some View {
        Group {
            switch state {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let text):
                ErrorBanner(message: text) { Task { await load() } }
            case .loaded(let detail):
                form(detail)
            }
        }
        .navigationTitle(code)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showIntake) {
            if let b = state.value?.booking {
                IntakeFormView(booking: b) { updated in
                    apply(updated)
                    store.changed()
                }
            }
        }
        .sheet(isPresented: $showWarranty) {
            if let d = state.value {
                IssueWarrantySheet(booking: d.booking, defaultMonths: d.defaults?.warrantyMonths ?? 6) { _ in
                    Task { await load() }
                    store.changed()
                }
            }
        }
        .sheet(item: $share) { item in ShareSheet(url: item.url) }
    }

    // MARK: - Form

    @ViewBuilder
    private func form(_ detail: BookingDetail) -> some View {
        let b = detail.booking
        Form {
            header(b)
            statusSection(b)
            if store.role.isManager { priceSection(b) }
            Section("console.job.device") {
                InfoRow(title: "console.job.device_label", value: b.device?.displayName ?? String(localized: "console.job.no_device"))
                if let issue = b.issue ?? b.custom { Text(issue).font(.body) }
            }
            intakeSection(b)
            repairSection(b)
            customerSection(b, detail.customer)
            if let pickup = b.pickup { pickupSection(pickup, b) }
            warrantySection(detail)
            timelineSection(b)
            if store.isLive { documentsSection(b, detail) }
            if let photos = b.photoIds, !photos.isEmpty {
                Section { InfoRow(title: "console.job.photos", value: "\(photos.count)") }
            }
        }
    }

    private func header(_ b: Booking) -> some View {
        Section {
            HStack(spacing: 8) {
                KindChip(kind: b.kind)
                if b.isWalkIn {
                    Label("console.job.walkin", systemImage: "figure.walk").labelStyle(.titleAndIcon).font(.caption2.bold()).lineLimit(1).fixedSize()
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color(.tertiarySystemFill)).clipShape(Capsule())
                }
                if let sheet = b.intake?.label {
                    Label(sheet, systemImage: "doc.text").labelStyle(.titleAndIcon).font(.caption2.bold()).lineLimit(1).fixedSize()
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color(.tertiarySystemFill)).clipShape(Capsule())
                }
                Spacer()
                StatusBadge(status: b.status)
            }
            if let slot = b.slot {
                InfoRow(title: "console.job.slot", value: ShopCalendar.dateTime(slot))
            }
        }
    }

    private func statusSection(_ b: Booking) -> some View {
        Section("console.job.status") {
            Picker("console.job.status", selection: $status) {
                ForEach(BookingStatus.allCases) { s in
                    Label { Text(LocalizedStringKey(s.titleKey)) } icon: { StatusDot(status: s, size: 10) }.tag(s)
                }
            }
            TextField("console.job.note", text: $note, axis: .vertical).lineLimit(1...4)
            if status != b.status {
                Toggle("console.job.notify", isOn: $notify)
            }
            Button {
                Task { await save(b) }
            } label: {
                HStack {
                    if saving { ProgressView().padding(.trailing, 4) }
                    Text("console.job.save")
                }
            }
            .disabled(saving || !hasChanges(b))
            if let message {
                Label(message, systemImage: messageIsError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .font(.footnote)
                    .foregroundColor(messageIsError ? Theme.danger : Theme.ok)
            }
        }
    }

    private func priceSection(_ b: Booking) -> some View {
        Section("console.job.money") {
            if let e = b.estimate { InfoRow(title: "booking.price.label", value: Money.estimate(e)) }
            if let transport = b.pickup?.quote?.totalLei { InfoRow(title: "console.job.transport", value: Money.lei(transport)) }
            HStack {
                Text("console.job.final_price")
                Spacer()
                TextField("0", text: $price).keyboardType(.numberPad).multilineTextAlignment(.trailing).frame(width: 110)
                Text("lei").foregroundColor(.secondary)
            }
        }
    }

    @ViewBuilder
    private func intakeSection(_ b: Booking) -> some View {
        Section("console.job.sheet") {
            if let intake = b.intake {
                InfoRow(title: "console.job.sheet_no", value: intake.label)
                InfoRow(title: "console.intake.device_type", value: intake.deviceType)
                if let v = intake.serial { InfoRow(title: "console.intake.serial", value: v) }
                if let v = intake.accessories { InfoRow(title: "console.intake.accessories", value: v) }
                if let v = intake.appearance { InfoRow(title: "console.intake.appearance", value: v) }
                InfoRow(title: "console.job.received", value: "\(ShopCalendar.dateTime(intake.receivedAt)) · \(intake.by)")
                Button("console.intake.edit") { showIntake = true }
            } else {
                Text("console.job.no_sheet").font(.footnote).foregroundColor(.secondary)
                Button { showIntake = true } label: { Label("console.intake.take_in", systemImage: "tray.and.arrow.down.fill") }
            }
        }
    }

    private func repairSection(_ b: Booking) -> some View {
        Section("console.job.repair") {
            TextField("console.repair.diagnosis", text: $diagnosis, axis: .vertical).lineLimit(2...6)
            TextField("console.repair.work_done", text: $workDone, axis: .vertical).lineLimit(2...6)
            TextField("console.repair.parts", text: $partsUsed, axis: .vertical).lineLimit(1...4)
        }
    }

    @ViewBuilder
    private func customerSection(_ b: Booking, _ customer: Customer?) -> some View {
        Section("console.job.customer") {
            InfoRow(title: "console.customer.name", value: b.contact?.name ?? "")
            if let phone = b.contact?.phone, !phone.isEmpty { InfoRow(title: "console.customer.phone", value: phone) }
            if let email = b.contact?.email, !email.isEmpty { InfoRow(title: "Email", value: email) }
            ContactButtons(phone: b.contact?.phone, email: b.contact?.email)
            if let customer {
                NavigationLink {
                    CustomerDetailView(customerId: customer.id)
                } label: {
                    Label("console.job.open_customer", systemImage: "person.crop.circle")
                }
            }
        }
    }

    private func pickupSection(_ p: PickupDetails, _ b: Booking) -> some View {
        Section("console.job.pickup") {
            InfoRow(title: "console.customer.address", value: p.address)
            if let trips = p.trips { InfoRow(title: "console.job.trips", value: String(localized: String.LocalizationValue(trips.localizedTitleKey))) }
            if p.urgent == true {
                Label("console.job.urgent", systemImage: "flame.fill").foregroundColor(Theme.danger)
            }
            Menu {
                Button { Navigator.openWaze(to: .init(latitude: p.lat, longitude: p.lon)) } label: { Label("Waze", systemImage: "arrow.triangle.turn.up.right.diamond.fill") }
                Button { Navigator.openAppleMaps(to: .init(latitude: p.lat, longitude: p.lon), name: b.contact?.name ?? p.address) } label: { Label("Apple Maps", systemImage: "map.fill") }
            } label: {
                Label("driver.action.navigate", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
            }
        }
    }

    @ViewBuilder
    private func warrantySection(_ detail: BookingDetail) -> some View {
        let b = detail.booking
        let active = detail.warranties.first { $0.state != .void }
        Section("console.job.warranty") {
            ForEach(detail.warranties) { w in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(w.label).font(.subheadline.bold())
                        Text("console.warranty.until \(ShopCalendar.medium(w.endsOn))").font(.caption).foregroundColor(.secondary)
                    }
                    Spacer()
                    WarrantyBadge(state: w.state)
                }
            }
            if active == nil {
                if b.status == .ready || b.status == .done {
                    Button { showWarranty = true } label: { Label("console.warranty.issue", systemImage: "checkmark.shield.fill") }
                } else {
                    Text("console.warranty.not_ready").font(.footnote).foregroundColor(.secondary)
                }
            }
        }
    }

    private func timelineSection(_ b: Booking) -> some View {
        Section("console.job.history") {
            let history = (b.statusHistory ?? []).reversed()
            if history.isEmpty { Text("console.job.no_history").foregroundColor(.secondary) }
            ForEach(Array(history.enumerated()), id: \.offset) { _, entry in
                HStack(alignment: .top, spacing: 10) {
                    StatusDot(status: entry.status, size: 10).padding(.top, 4)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(LocalizedStringKey(entry.status.titleKey)).font(.subheadline.bold())
                        Text("\(ShopCalendar.dateTime(entry.at)) · \(entry.by)").font(.caption).foregroundColor(.secondary)
                        if let n = entry.note, !n.isEmpty { Text(n).font(.footnote) }
                    }
                }
            }
        }
    }

    private func documentsSection(_ b: Booking, _ detail: BookingDetail) -> some View {
        Section("console.job.documents") {
            if b.intake != nil {
                Button { Task { await openPDF("api/admin/bookings/\(code)/intake.pdf", "Fisa-\(b.intake?.label.replacingOccurrences(of: "/", with: "-") ?? code).pdf") } } label: {
                    Label("console.job.sheet_pdf", systemImage: "doc.richtext")
                }
            }
            ForEach(detail.warranties) { w in
                Button { Task { await openPDF("api/admin/warranties/\(w.id).pdf", "Garantie-\(w.label.replacingOccurrences(of: "/", with: "-")).pdf") } } label: {
                    Label("\(String(localized: "console.warranty.pdf")) \(w.label)", systemImage: "doc.richtext")
                }
            }
        }
    }

    // MARK: - Logic

    private func hasChanges(_ b: Booking) -> Bool {
        status != b.status
            || !note.isEmpty
            || priceChange(b) != .keep
            || diagnosis != (b.repair?.diagnosis ?? "")
            || workDone != (b.repair?.workDone ?? "")
            || partsUsed != (b.repair?.partsUsed ?? "")
    }

    private func priceChange(_ b: Booking) -> PriceChange {
        guard store.role.isManager else { return .keep }
        let digits = price.filter(\.isNumber)
        if digits.isEmpty { return b.finalLei == nil ? .keep : .clear }
        guard let value = Int(digits), value != b.finalLei else { return .keep }
        return .set(value)
    }

    private func fill(_ b: Booking) {
        status = b.status
        note = ""
        notify = true
        price = b.finalLei.map(String.init) ?? ""
        diagnosis = b.repair?.diagnosis ?? ""
        workDone = b.repair?.workDone ?? ""
        partsUsed = b.repair?.partsUsed ?? ""
    }

    private func load() async {
        do {
            let detail = try await store.repo.booking(code: code)
            state = .loaded(detail)
            fill(detail.booking)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func apply(_ updated: Booking) {
        guard let d = state.value else { return }
        state = .loaded(BookingDetail(booking: updated, warranties: d.warranties, customer: d.customer, defaults: d.defaults))
        fill(updated)
    }

    private func save(_ b: Booking) async {
        saving = true
        message = nil
        var repair = RepairNotes()
        if diagnosis != (b.repair?.diagnosis ?? "") { repair.diagnosis = diagnosis }
        if workDone != (b.repair?.workDone ?? "") { repair.workDone = workDone }
        if partsUsed != (b.repair?.partsUsed ?? "") { repair.partsUsed = partsUsed }
        let hasRepair = repair.diagnosis != nil || repair.workDone != nil || repair.partsUsed != nil
        let update = StatusUpdate(status: status, note: note, price: priceChange(b), notify: notify, repair: hasRepair ? repair : nil)
        do {
            let updated = try await store.repo.updateStatus(code: code, update: update)
            apply(updated)
            store.changed()
            messageIsError = false
            message = String(localized: "console.job.saved")
        } catch {
            messageIsError = true
            message = error.localizedDescription
        }
        saving = false
    }

    private func openPDF(_ path: String, _ name: String) async {
        do {
            let url = try await store.repo.pdf(path: path, fileName: name)
            share = ShareItem(url: url)
        } catch {
            messageIsError = true
            message = error.localizedDescription
        }
    }
}

struct WarrantyBadge: View {
    let state: WarrantyState

    private var tint: Color {
        switch state {
        case .active: return Theme.ok
        case .expiring: return Theme.shop
        case .expired: return .secondary
        case .void: return Theme.danger
        }
    }

    var body: some View {
        Text(loc("console.warranty.state.\(state.rawValue)"))
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(tint.opacity(0.14))
            .foregroundColor(tint)
            .clipShape(Capsule())
    }
}

// MARK: - Service sheet form

struct IntakeFormView: View {
    let booking: Booking
    var onSaved: (Booking) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var store: OwnerStore
    @State private var input = IntakeInput()
    @State private var saving = false
    @State private var error: String?

    private var editing: Bool { booking.intake != nil }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("console.intake.device_type", text: $input.deviceType)
                    TextField("console.intake.serial", text: $input.serial)
                    TextField("console.intake.accessories", text: $input.accessories, axis: .vertical).lineLimit(1...3)
                    TextField("console.intake.appearance", text: $input.appearance, axis: .vertical).lineLimit(1...4)
                } footer: {
                    Text("console.intake.hint")
                }
                if !editing, booking.contact?.email?.isEmpty == false {
                    Section { Toggle("console.intake.email", isOn: $input.email) }
                }
                if let error { Section { Text(error).foregroundColor(Theme.danger) } }
            }
            .navigationTitle(LocalizedStringKey(editing ? "console.intake.edit" : "console.intake.take_in"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(LocalizedStringKey("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(LocalizedStringKey("common.save")) { Task { await save() } }
                        .disabled(saving || input.deviceType.trimmingCharacters(in: .whitespaces).count < 2)
                }
            }
            .onAppear {
                if let i = booking.intake {
                    input = IntakeInput(deviceType: i.deviceType, serial: i.serial ?? "", accessories: i.accessories ?? "", appearance: i.appearance ?? "", email: false)
                } else {
                    input.deviceType = booking.device?.brand ?? ""
                }
            }
        }
    }

    private func save() async {
        saving = true
        do {
            let updated = editing
                ? try await store.repo.editIntake(code: booking.code, input: input)
                : try await store.repo.createIntake(code: booking.code, input: input)
            onSaved(updated)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

// MARK: - Warranty

struct IssueWarrantySheet: View {
    let booking: Booking
    let defaultMonths: Int
    var onIssued: (Warranty) -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var store: OwnerStore
    @State private var months = 6
    @State private var work = ""
    @State private var email = true
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Stepper(value: $months, in: 1...60) {
                        HStack {
                            Text("console.warranty.months")
                            Spacer()
                            Text("\(months)").monospacedDigit().foregroundColor(.secondary)
                        }
                    }
                    TextField("console.warranty.work", text: $work, axis: .vertical).lineLimit(2...6)
                } footer: {
                    Text("console.warranty.hint")
                }
                if booking.status == .done, booking.contact?.email?.isEmpty == false {
                    Section { Toggle("console.warranty.email", isOn: $email) }
                }
                if let error { Section { Text(error).foregroundColor(Theme.danger) } }
            }
            .navigationTitle(LocalizedStringKey("console.warranty.issue"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(LocalizedStringKey("common.cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(LocalizedStringKey("console.warranty.issue_button")) { Task { await issue() } }.disabled(saving)
                }
            }
            .onAppear {
                months = defaultMonths
                work = booking.repair?.workDone ?? ""
            }
        }
    }

    private func issue() async {
        saving = true
        do {
            let w = try await store.repo.issueWarranty(code: booking.code, months: months, work: work, email: email)
            onIssued(w)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}
