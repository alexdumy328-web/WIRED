import Foundation

/// Sample data for the owner console, built around today so the screens always have something to show.
/// Writes change this copy only, until the app restarts.
actor MockOwnerRepository: OwnerRepository {
    static let shared = MockOwnerRepository()

    nonisolated var isLive: Bool { false }

    private var staffRole: StaffRole = .dev
    private var bookingList: [Booking] = []
    private var customerList: [Customer] = []
    private var warrantyList: [Warranty] = []
    private var shopSettings: ShopSettings

    private let me = "Alex (dev)"

    init() {
        shopSettings = MockOwnerRepository.defaultSettings()
        let seeded = MockOwnerRepository.seed()
        bookingList = seeded.bookings
        customerList = seeded.customers
        warrantyList = seeded.warranties
    }

    func setRole(_ role: StaffRole) { staffRole = role }

    /// Technicians never see what was charged.
    private func view(_ b: Booking) -> Booking {
        guard !staffRole.isManager else { return b }
        var copy = b
        copy.finalLei = nil
        return copy
    }

    // MARK: - Staff

    func role() async throws -> StaffRole { staffRole }

    func counts() async throws -> StaffCounts {
        var byStatus: [String: Int] = [:]
        for b in bookingList { byStatus[b.status.rawValue, default: 0] += 1 }
        return StaffCounts(byStatus: byStatus, warranties: warrantyCounts())
    }

    private func warrantyCounts() -> WarrantyCounts {
        WarrantyCounts(
            valid: warrantyList.filter { $0.state == .active || $0.state == .expiring }.count,
            expiring: warrantyList.filter { $0.state == .expiring }.count
        )
    }

    // MARK: - Bookings

    func bookings(_ q: BookingQuery) async throws -> Page<Booking> {
        var list = bookingList
        if let status = q.status {
            if status == "handback" {
                list = list.filter { $0.status == .ready || $0.status == .unrepairable }
            } else {
                list = list.filter { $0.status.rawValue == status }
            }
        }
        if let mode = q.mode {
            switch mode {
            case .shop: list = list.filter { $0.mode == "shop" && $0.pickup == nil }
            case .pickup: list = list.filter { $0.mode == "shop" && $0.pickup != nil }
            case .mobile: list = list.filter { $0.mode == "mobile" }
            }
        }
        if let intake = q.intake {
            list = list.filter { ($0.intake != nil) == intake }
        }
        let text = q.text.trimmingCharacters(in: .whitespaces).lowercased()
        if !text.isEmpty {
            list = list.filter { b in
                [b.code, b.contact?.name, b.contact?.phone, b.device?.displayName, b.issue, b.custom]
                    .compactMap { $0?.lowercased() }
                    .contains { $0.contains(text) }
            }
        }
        list.sort { ($0.slot ?? "") > ($1.slot ?? "") }
        let page = Array(list.dropFirst(q.skip).prefix(q.limit))
        return Page(total: list.count, items: page.map(view))
    }

    func booking(code: String) async throws -> BookingDetail {
        guard let b = bookingList.first(where: { $0.code == code }) else { throw APIError.notFound }
        let customer = customerList.first { $0.id == b.customerId }
        return BookingDetail(
            booking: view(b),
            warranties: warrantyList.filter { $0.bookingCode == code },
            customer: customer,
            defaults: .init(warrantyMonths: 6)
        )
    }

    private func index(_ code: String) throws -> Int {
        guard let i = bookingList.firstIndex(where: { $0.code == code }) else { throw APIError.notFound }
        return i
    }

    func updateStatus(code: String, update: StatusUpdate) async throws -> Booking {
        let i = try index(code)
        var b = bookingList[i]
        let now = ShopCalendar.iso(Date())
        let changed = b.status != update.status
        let noted = !(update.note ?? "").isEmpty
        if changed || noted {
            var history = b.statusHistory ?? []
            history.append(StatusEntry(status: update.status, at: now, by: me, byId: nil, note: noted ? update.note : nil))
            b.statusHistory = history
        }
        b.status = update.status
        if update.status == .done { b.deliveredAt = now }
        switch update.price {
        case .keep: break
        case .set(let lei): b.finalLei = lei
        case .clear: b.finalLei = nil
        }
        if let repair = update.repair {
            var notes = b.repair ?? RepairNotes()
            if let v = repair.diagnosis { notes.diagnosis = v.isEmpty ? nil : v }
            if let v = repair.workDone { notes.workDone = v.isEmpty ? nil : v }
            if let v = repair.partsUsed { notes.partsUsed = v.isEmpty ? nil : v }
            b.repair = notes
        }
        b.updatedAt = now
        bookingList[i] = b
        return view(b)
    }

    private func nextSheet(_ year: Int) -> Int {
        (bookingList.compactMap { $0.intake }.filter { $0.year == year }.map(\.number).max() ?? 0) + 1
    }

    private func makeIntake(_ input: IntakeInput) -> Intake {
        let year = ShopCalendar.calendar.component(.year, from: Date())
        return Intake(
            number: nextSheet(year),
            year: year,
            receivedAt: ShopCalendar.iso(Date()),
            deviceType: input.deviceType,
            serial: input.serial.isEmpty ? nil : input.serial,
            accessories: input.accessories.isEmpty ? nil : input.accessories,
            appearance: input.appearance.isEmpty ? nil : input.appearance,
            by: me
        )
    }

    func createIntake(code: String, input: IntakeInput) async throws -> Booking {
        let i = try index(code)
        guard bookingList[i].intake == nil else { throw APIError.conflict("already_has_intake") }
        bookingList[i].intake = makeIntake(input)
        return view(bookingList[i])
    }

    func editIntake(code: String, input: IntakeInput) async throws -> Booking {
        let i = try index(code)
        guard var intake = bookingList[i].intake else { throw APIError.notFound }
        intake.deviceType = input.deviceType
        intake.serial = input.serial.isEmpty ? nil : input.serial
        intake.accessories = input.accessories.isEmpty ? nil : input.accessories
        intake.appearance = input.appearance.isEmpty ? nil : input.appearance
        bookingList[i].intake = intake
        return view(bookingList[i])
    }

    func walkIn(_ input: WalkInInput) async throws -> Booking {
        let customer: Customer
        if let id = input.customerId, let existing = customerList.first(where: { $0.id == id }) {
            customer = existing
        } else if let draft = input.customer {
            customer = try await createCustomer(draft)
        } else {
            throw APIError.serverError("customer_required")
        }
        let now = ShopCalendar.iso(Date())
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        let code = "NT-" + String((0..<4).map { _ in alphabet.randomElement()! })
        let booking = Booking(
            code: code,
            status: .received,
            mode: "shop",
            jobIds: [],
            issue: input.issue,
            slot: now,
            device: DeviceDetails(brand: input.brand.isEmpty ? nil : input.brand, model: input.model.isEmpty ? nil : input.model, year: nil),
            contact: ContactInfo(name: customer.name, phone: customer.phone, email: customer.email),
            pickup: nil,
            estimate: Estimate(priceFrom: Double(input.priceFrom), priceTo: Double(input.priceTo), etaHours: nil),
            updatedAt: now,
            source: "walk-in",
            createdAt: now,
            customerId: customer.id,
            intake: makeIntake(input.intake),
            statusHistory: [StatusEntry(status: .received, at: now, by: me, byId: nil, note: nil)]
        )
        bookingList.append(booking)
        if let c = customerList.firstIndex(where: { $0.id == customer.id }) {
            customerList[c].updatedAt = now
            customerList[c].jobs = (customerList[c].jobs ?? 0) + 1
            customerList[c].open = (customerList[c].open ?? 0) + 1
            customerList[c].lastVisit = now
        }
        return view(booking)
    }

    // MARK: - Customers

    func customers(text: String, archived: Bool, limit: Int, skip: Int) async throws -> Page<Customer> {
        var list = customerList.filter { ($0.archived ?? false) == archived }
        let q = text.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            list = list.filter { c in
                [c.name, c.phone, c.email, c.company?.name, c.company?.cui]
                    .compactMap { $0?.lowercased() }
                    .contains { $0.contains(q) }
            }
        }
        list.sort { $0.updatedAt > $1.updatedAt }
        return Page(total: list.count, items: Array(list.dropFirst(skip).prefix(limit)))
    }

    func customer(id: String) async throws -> CustomerDetail {
        guard let c = customerList.first(where: { $0.id == id }) else { throw APIError.notFound }
        return CustomerDetail(
            customer: c,
            jobs: bookingList.filter { $0.customerId == id }.sorted { ($0.slot ?? "") > ($1.slot ?? "") }.map(view),
            warranties: warrantyList.filter { $0.customerId == id }
        )
    }

    private func apply(_ input: CustomerInput, to c: inout Customer) {
        c.name = input.name
        c.phone = input.phone.isEmpty ? nil : input.phone
        c.email = input.email.isEmpty ? nil : input.email
        let company = CompanyRef(
            name: (input.company.name ?? "").isEmpty ? nil : input.company.name,
            cui: (input.company.cui ?? "").isEmpty ? nil : input.company.cui,
            regCom: (input.company.regCom ?? "").isEmpty ? nil : input.company.regCom
        )
        c.company = (company.name == nil && company.cui == nil && company.regCom == nil) ? nil : company
        c.address = input.address.isEmpty ? nil : input.address
        c.notes = input.notes.isEmpty ? nil : input.notes
        c.preferred = input.preferred
    }

    private func validate(_ input: CustomerInput) throws {
        if input.name.trimmingCharacters(in: .whitespaces).count < 2 { throw APIError.serverError("Numele e prea scurt.") }
        if input.preferred == .email && input.email.isEmpty { throw APIError.serverError("Emailul e obligatoriu când clientul preferă emailul.") }
        if input.preferred != .email && input.phone.isEmpty { throw APIError.serverError("Telefonul e obligatoriu pentru apel, SMS și WhatsApp.") }
    }

    func createCustomer(_ input: CustomerInput) async throws -> Customer {
        try validate(input)
        if !input.phone.isEmpty, customerList.contains(where: { $0.phone == input.phone }) {
            throw APIError.conflict("customer_exists")
        }
        let now = ShopCalendar.iso(Date())
        var c = Customer(id: String(format: "%024x", Int.random(in: 1...Int.max)), name: "", preferred: input.preferred, createdAt: now, updatedAt: now, jobs: 0, open: 0)
        apply(input, to: &c)
        customerList.append(c)
        return c
    }

    func updateCustomer(id: String, input: CustomerInput) async throws -> Customer {
        try validate(input)
        guard let i = customerList.firstIndex(where: { $0.id == id }) else { throw APIError.notFound }
        apply(input, to: &customerList[i])
        customerList[i].updatedAt = ShopCalendar.iso(Date())
        return customerList[i]
    }

    func archiveCustomer(id: String, archived: Bool) async throws -> Customer {
        guard staffRole.isManager else { throw APIError.forbidden }
        guard let i = customerList.firstIndex(where: { $0.id == id }) else { throw APIError.notFound }
        customerList[i].archived = archived
        return customerList[i]
    }

    // MARK: - Warranties

    func warranties(text: String, state: String?, limit: Int, skip: Int) async throws -> Page<Warranty> {
        var list = warrantyList
        if let state {
            switch state {
            case "void": list = list.filter { $0.state == .void }
            case "valid": list = list.filter { $0.state == .active || $0.state == .expiring }
            case "expiring": list = list.filter { $0.state == .expiring }
            case "expired": list = list.filter { $0.state == .expired }
            default: break
            }
        }
        let q = text.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            list = list.filter { w in
                [w.label, w.customerName, w.device, w.bookingCode].contains { $0.lowercased().contains(q) }
            }
        }
        list.sort { $0.issuedAt > $1.issuedAt }
        return Page(total: list.count, items: Array(list.dropFirst(skip).prefix(limit)))
    }

    func issueWarranty(code: String, months: Int?, work: String?, email: Bool) async throws -> Warranty {
        let i = try index(code)
        let b = bookingList[i]
        guard b.status == .ready || b.status == .done else { throw APIError.conflict("not_finished") }
        guard !warrantyList.contains(where: { $0.bookingCode == code && $0.state != .void }) else { throw APIError.conflict("warranty_exists") }
        let year = ShopCalendar.calendar.component(.year, from: Date())
        let number = (warrantyList.filter { $0.year == year }.map(\.number).max() ?? 0) + 1
        let m = months ?? 6
        let today = ShopCalendar.dateString()
        let w = Warranty(
            id: String(format: "%024x", Int.random(in: 1...Int.max)),
            label: "G\(number)/\(year)",
            number: number,
            year: year,
            bookingCode: code,
            sheet: b.intake?.label,
            customerId: b.customerId,
            customerName: b.contact?.name ?? "",
            device: b.device?.displayName ?? "",
            work: (work?.isEmpty == false ? work! : (b.repair?.workDone ?? b.issue ?? "")),
            months: m,
            startsOn: today,
            endsOn: ShopCalendar.addMonths(today, m),
            issuedAt: ShopCalendar.iso(Date()),
            issuedBy: me,
            voided: nil,
            state: .active
        )
        warrantyList.append(w)
        return w
    }

    func voidWarranty(id: String, reason: String) async throws -> Warranty {
        guard staffRole.isManager else { throw APIError.forbidden }
        guard let i = warrantyList.firstIndex(where: { $0.id == id }) else { throw APIError.notFound }
        warrantyList[i].voided = .init(at: ShopCalendar.iso(Date()), by: me, reason: reason)
        warrantyList[i].state = .void
        return warrantyList[i]
    }

    // MARK: - Schedule

    func calendar(week: String) async throws -> CalendarWeek {
        let monday = ShopCalendar.mondayOf(week)
        let days = (0..<7).map { offset -> CalendarDay in
            let date = ShopCalendar.addDays(monday, offset)
            let slots = bookingList
                .filter { $0.status != .cancelled && ShopCalendar.day(of: $0.slot ?? "") == date }
                .sorted { ($0.slot ?? "") < ($1.slot ?? "") }
                .map { b in
                    CalendarSlot(
                        slot: b.slot ?? "",
                        code: b.code,
                        mode: b.mode ?? "shop",
                        status: b.status,
                        name: b.contact?.name ?? "",
                        device: b.device?.displayName ?? "",
                        pickup: b.pickup != nil
                    )
                }
            return CalendarDay(date: date, slots: slots)
        }
        return CalendarWeek(weekStart: monday, days: days)
    }

    func busy(from: String, to: String) async throws -> [String: BusyDaySummary] {
        var days: [String: BusyDaySummary] = [:]
        for b in bookingList where b.status != .cancelled {
            let d = ShopCalendar.day(of: b.slot ?? "")
            guard d >= from, d <= to else { continue }
            var s = days[d] ?? BusyDaySummary(total: 0, pickups: 0)
            s.total += 1
            if b.pickup != nil { s.pickups += 1 }
            days[d] = s
        }
        return days
    }

    func pickups(date: String) async throws -> PickupsResponse {
        let jobs = bookingList
            .filter { $0.pickup != nil && $0.status != .cancelled && ShopCalendar.day(of: $0.slot ?? "") == date }
            .sorted { ($0.slot ?? "") < ($1.slot ?? "") }
            .compactMap { b -> PickupJob? in
                guard let p = b.pickup, let slot = b.slot, let at = ShopCalendar.parse(slot) else { return nil }
                return PickupJob(
                    code: b.code,
                    status: b.status,
                    slot: slot,
                    window: PickupWindow(from: ShopCalendar.iso(at.addingTimeInterval(-1800)), to: ShopCalendar.iso(at.addingTimeInterval(1800))),
                    trips: p.trips ?? .both,
                    urgent: p.urgent ?? false,
                    address: p.address,
                    lat: p.lat,
                    lon: p.lon,
                    mapLink: "https://maps.apple.com/?ll=\(p.lat),\(p.lon)",
                    name: b.contact?.name ?? "",
                    phone: b.contact?.phone ?? "",
                    device: b.device?.displayName ?? "",
                    quoteLei: p.quote?.totalLei ?? 0
                )
            }
        return PickupsResponse(date: date, jobs: jobs)
    }

    // MARK: - Stats and settings

    func stats() async throws -> Stats {
        guard staffRole.isManager else { throw APIError.forbidden }
        let today = ShopCalendar.dateString()
        let firstMonday = ShopCalendar.addDays(ShopCalendar.mondayOf(today), -77)
        let created = [3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 8, 10]
        let weekly = (0..<12).map { i in
            TrendPoint(
                start: ShopCalendar.addDays(firstMonday, i * 7),
                created: created[i],
                done: max(0, created[i] - 1),
                bookedLei: Double(created[i]) * 310,
                doneLei: Double(max(0, created[i] - 1)) * 285,
                transportLei: Double(created[i] / 2) * 45
            )
        }
        let firstOfMonth = String(today.prefix(7)) + "-01"
        let monthly = (0..<12).map { i -> TrendPoint in
            let n = 14 + i * 2 + (i % 3) * 3
            return TrendPoint(
                start: ShopCalendar.addMonths(firstOfMonth, i - 11),
                created: n,
                done: n - 2,
                bookedLei: Double(n) * 305,
                doneLei: Double(n - 2) * 280,
                transportLei: Double(n / 2) * 45
            )
        }
        var byStatus: [String: Int] = [:]
        for b in bookingList { byStatus[b.status.rawValue, default: 0] += 1 }
        let doneLei = bookingList.filter { $0.status == .done }.reduce(0.0) { $0 + Double($1.finalLei ?? 0) }
        let pipeline = bookingList
            .filter { ![.done, .cancelled, .unrepairable].contains($0.status) }
            .reduce(0.0) { $0 + (($1.estimate?.priceFrom ?? 0) + ($1.estimate?.priceTo ?? 0)) / 2 }
        return Stats(
            weeks: weekly.map { WeekCount(weekStart: $0.start, count: $0.created) },
            trend: StatsTrend(weekly: weekly, monthly: monthly),
            byCategory: ["laptop": 14, "phone": 11, "coffee": 6, "board": 5, "custom": 3],
            byStatus: byStatus,
            total: bookingList.count,
            active: bookingList.filter { [.received, .diagnosis, .waitingParts, .repairing].contains($0.status) }.count,
            revenue: StatsRevenue(doneLei: doneLei, pipelineLei: pipeline),
            warranties: warrantyCounts()
        )
    }

    func settings() async throws -> ShopSettings {
        guard staffRole.isManager else { throw APIError.forbidden }
        return shopSettings
    }

    func saveSettings(_ settings: ShopSettings) async throws -> ShopSettings {
        guard staffRole.isManager else { throw APIError.forbidden }
        let r = settings.labour.valueRate
        guard r.low <= r.mid, r.mid <= r.high, r.high <= r.premium else {
            throw APIError.serverError("Tarifele nu pot scădea de la mic la premium.")
        }
        shopSettings = settings
        shopSettings.updatedAt = ShopCalendar.iso(Date())
        return shopSettings
    }

    func pdf(path: String, fileName: String) async throws -> URL {
        throw APIError.serverError("PDF-urile se generează doar de serverul real. Oprește datele de test.")
    }
}

// MARK: - Seed

extension MockOwnerRepository {
    static func defaultSettings() -> ShopSettings {
        ShopSettings(
            pickup: PickupRates(dieselLeiPerL: 7.5, consumptionLPer100: 7, driverLeiPerHour: 40, stopMinutes: 10, minTripLei: 25, urgentFactor: 1.5, maxKm: 25),
            labour: LabourRates(
                valueRate: ValueRates(low: 80, mid: 110, high: 150, premium: 220),
                consumablesFactor: ConsumablesFactors(low: 1.05, medium: 1.15, high: 1.3)
            ),
            company: CompanyDetails(name: "Norgelis Tech", address: "Iași"),
            documents: DocumentSettings(
                intakeTerms: "Dispozitivul se predă pentru diagnostic și reparație. Atelierul nu răspunde pentru datele stocate.",
                warrantyTerms: "Garanția acoperă manopera și piesele înlocuite, nu daunele provocate ulterior.",
                warrantyMonths: ["laptop": 6, "pc": 6, "board": 6, "coffee": 3, "appliance": 3, "it": 3, "vintage": 3, "auto": 3, "custom": 3]
            ),
            updatedAt: nil
        )
    }

    fileprivate static func seed() -> (bookings: [Booking], customers: [Customer], warranties: [Warranty]) {
        let today = ShopCalendar.dateString()
        func day(_ offset: Int, _ hour: Int, _ minute: Int = 0) -> String {
            ShopCalendar.isoFor(day: ShopCalendar.addDays(today, offset), hour: hour, minute: minute)
        }
        func history(_ steps: [(BookingStatus, Int, String?)]) -> [StatusEntry] {
            steps.map { StatusEntry(status: $0.0, at: day($0.1, 9), by: $0.0 == .received ? "customer" : "Alex (dev)", byId: nil, note: $0.2) }
        }

        func customer(_ id: String, _ name: String, _ phone: String?, _ email: String?, _ preferred: ContactChannel, jobs: Int, open: Int, last: Int, company: CompanyRef? = nil, notes: String? = nil, address: String? = nil) -> Customer {
            Customer(id: id, name: name, phone: phone, email: email, company: company, address: address, notes: notes, preferred: preferred,
                     createdAt: day(-60, 10), updatedAt: day(last, 10), archived: nil, jobs: jobs, open: open, lastVisit: day(last, 10))
        }
        let customers = [
            customer("c0000000000000000000a001", "Andrei Popescu", "+40 700 000 001", "andrei@example.com", .whatsapp, jobs: 3, open: 1, last: 0),
            customer("c0000000000000000000a002", "Elena Ionescu", "+40 700 000 002", "elena@example.com", .phone, jobs: 1, open: 1, last: 0, address: "Bd. Carol I nr. 14, Iași"),
            customer("c0000000000000000000a003", "Mihai Dumitrescu", "+40 700 000 003", nil, .sms, jobs: 2, open: 1, last: 0),
            customer("c0000000000000000000a004", "Ioana Radu", "+40 700 000 004", "ioana@example.com", .email, jobs: 1, open: 1, last: 0),
            customer("c0000000000000000000a005", "Radu Marin", "+40 700 000 005", nil, .phone, jobs: 1, open: 1, last: 0, notes: "Vine de obicei seara."),
            customer("c0000000000000000000a006", "Digital Print SRL", "+40 700 000 006", "office@digitalprint.example", .email, jobs: 2, open: 1, last: 1,
                     company: CompanyRef(name: "Digital Print SRL", cui: "RO12345678", regCom: "J22/1234/2019")),
            customer("c0000000000000000000a007", "Maria Tudor", "+40 700 000 007", "maria@example.com", .whatsapp, jobs: 2, open: 0, last: -5),
        ]

        func pickup(_ address: String, _ lat: Double, _ lon: Double, _ trips: PickupTrips, urgent: Bool, lei: Double, km: Double) -> PickupDetails {
            PickupDetails(address: address, lat: lat, lon: lon, trips: trips, urgent: urgent, quote: PickupQuote(totalLei: lei, oneWayKm: km, urgentLei: urgent ? 20 : 0))
        }
        func intake(_ n: Int, _ type: String, serial: String? = nil, accessories: String? = nil, appearance: String? = nil, at: Int) -> Intake {
            Intake(number: n, year: ShopCalendar.calendar.component(.year, from: Date()), receivedAt: day(at, 9), deviceType: type, serial: serial, accessories: accessories, appearance: appearance, by: "Alex (dev)")
        }
        let contact = { (id: Int) -> ContactInfo in
            let c = customers[id]
            return ContactInfo(name: c.name, phone: c.phone, email: c.email)
        }

        let bookings = [
            Booking(code: "NT-4K7Q", status: .diagnosis, mode: "shop", jobIds: ["laptop-ssd-upgrade", "laptop-cleaning"],
                    issue: "MacBook Air se încălzește excesiv și bateria ține sub o oră.", slot: day(0, 10, 30),
                    device: DeviceDetails(brand: "Apple", model: "MacBook Air M1", year: "2021"), contact: contact(0),
                    pickup: pickup("Str. Palas 7A, Iași", 47.1585, 27.6014, .both, urgent: true, lei: 70, km: 4.8),
                    estimate: Estimate(priceFrom: 180, priceTo: 320, etaHours: [24, 48]), updatedAt: day(0, 9),
                    source: "online", createdAt: day(-1, 18), customerId: customers[0].id,
                    intake: intake(14, "Laptop", serial: "C02XK1JGQ6L4", accessories: "Încărcător MagSafe", appearance: "Zgârieturi pe capac", at: 0),
                    statusHistory: history([(.received, -1, nil), (.diagnosis, 0, "Se verifică ventilația.")])),
            Booking(code: "NT-8B2M", status: .waitingParts, mode: "shop", jobIds: ["phone-screen"],
                    issue: "Ecran spart în urma unei căzături pe asfalt.", slot: day(0, 11, 45),
                    device: DeviceDetails(brand: "Samsung", model: "Galaxy S23", year: "2023"), contact: contact(1),
                    pickup: pickup("Bulevardul Carol I nr. 14 (Copou), Iași", 47.1750, 27.5680, .pickup, urgent: false, lei: 35, km: 3.2),
                    estimate: Estimate(priceFrom: 450, priceTo: 650, etaHours: [48, 72]), updatedAt: day(0, 8),
                    source: "online", createdAt: day(-2, 12), customerId: customers[1].id,
                    intake: intake(13, "Telefon", accessories: "Husă", at: -1),
                    repair: RepairNotes(diagnosis: "Display și touch defecte. Placa funcționează.", workDone: nil, partsUsed: "Display OLED original (comandat)"),
                    statusHistory: history([(.received, -2, nil), (.diagnosis, -1, nil), (.waitingParts, 0, "Display comandat, vine mâine.")])),
            Booking(code: "NT-2P9X", status: .ready, mode: "shop", jobIds: ["coffee-pump"],
                    issue: "Espressorul nu mai trage apă și scoate zgomot ciudat.", slot: day(0, 13, 15),
                    device: DeviceDetails(brand: "DeLonghi", model: "Magnifica S", year: "2022"), contact: contact(2),
                    pickup: pickup("Str. Sfântul Lazăr nr. 27, Iași", 47.1560, 27.5890, .dropoff, urgent: false, lei: 35, km: 4.1),
                    estimate: Estimate(priceFrom: 0, priceTo: 0, etaHours: nil), updatedAt: day(0, 8),
                    source: "online", createdAt: day(-4, 11), customerId: customers[2].id,
                    intake: intake(11, "Espressor", at: -3),
                    repair: RepairNotes(diagnosis: "Pompă blocată de calcar.", workDone: "Pompă curățată, garnituri schimbate, detartrare.", partsUsed: "Set garnituri"),
                    finalLei: 260,
                    statusHistory: history([(.received, -4, nil), (.diagnosis, -3, nil), (.repairing, -2, nil), (.ready, 0, nil)])),
            Booking(code: "NT-6R3W", status: .received, mode: "shop", jobIds: ["laptop-battery"],
                    issue: "Laptopul se închide brusc când este deconectat de la încărcător.", slot: day(0, 14, 30),
                    device: DeviceDetails(brand: "Lenovo", model: "ThinkPad T14", year: "2021"), contact: contact(3),
                    pickup: pickup("Șoseaua Păcurari nr. 82, Iași", 47.1710, 27.5510, .pickup, urgent: true, lei: 60, km: 2.5),
                    estimate: Estimate(priceFrom: 220, priceTo: 280, etaHours: [24, 24]), updatedAt: day(0, 10),
                    source: "online", createdAt: day(0, 8), customerId: customers[3].id,
                    statusHistory: history([(.received, 0, nil)])),
            Booking(code: "NT-9C1D", status: .repairing, mode: "shop", jobIds: [],
                    issue: "Amplificator audio fără sunet pe canalul stâng.", slot: day(0, 16),
                    device: DeviceDetails(brand: "Technics", model: "SU-V300", year: nil), contact: contact(4),
                    pickup: nil, estimate: Estimate(priceFrom: 150, priceTo: 250, etaHours: nil), updatedAt: day(0, 12),
                    source: "walk-in", createdAt: day(-1, 17), customerId: customers[4].id,
                    intake: intake(12, "Amplificator", serial: "TS-77120", accessories: "Cablu de alimentare", appearance: "Buton volum slăbit", at: -1),
                    repair: RepairNotes(diagnosis: "Tranzistor final defect pe canalul stâng.", workDone: nil, partsUsed: nil),
                    statusHistory: history([(.received, -1, nil), (.diagnosis, -1, nil), (.repairing, 0, nil)])),
            Booking(code: "NT-3F8H", status: .done, mode: "shop", jobIds: ["laptop-screen"],
                    issue: "Ecran cu linii verticale.", slot: day(-6, 10),
                    device: DeviceDetails(brand: "HP", model: "Pavilion 15", year: "2020"), contact: contact(6),
                    pickup: nil, estimate: Estimate(priceFrom: 350, priceTo: 450, etaHours: [48, 72]), updatedAt: day(-5, 12),
                    source: "online", createdAt: day(-8, 9), customerId: customers[6].id,
                    intake: intake(9, "Laptop", serial: "5CD0123ABC", accessories: "Încărcător", at: -6),
                    repair: RepairNotes(diagnosis: "Cablu video uzat.", workDone: "Cablu video și panou înlocuite.", partsUsed: "Panou 15.6 FHD"),
                    deliveredAt: day(-5, 12), finalLei: 400,
                    statusHistory: history([(.received, -8, nil), (.diagnosis, -6, nil), (.repairing, -6, nil), (.ready, -5, nil), (.done, -5, nil)])),
            Booking(code: "NT-7J2K", status: .unrepairable, mode: "shop", jobIds: [],
                    issue: "Telefon udat, nu mai pornește.", slot: day(-2, 15),
                    device: DeviceDetails(brand: "Xiaomi", model: "Redmi Note 10", year: nil), contact: contact(6),
                    pickup: nil, estimate: Estimate(priceFrom: 0, priceTo: 0, etaHours: nil), updatedAt: day(-1, 10),
                    source: "walk-in", createdAt: day(-2, 15), customerId: customers[6].id,
                    intake: intake(10, "Telefon", at: -2),
                    repair: RepairNotes(diagnosis: "Placă de bază corodată, fără recuperare.", workDone: nil, partsUsed: nil),
                    statusHistory: history([(.received, -2, nil), (.diagnosis, -2, nil), (.unrepairable, -1, "Clientul a fost anunțat.")])),
            Booking(code: "NT-5L6N", status: .received, mode: "mobile", jobIds: ["printer-service"],
                    issue: "Imprimantă de birou cu blocaje repetate de hârtie.", slot: day(1, 9),
                    device: DeviceDetails(brand: "Canon", model: "iR 1643", year: nil), contact: contact(5),
                    pickup: nil, estimate: Estimate(priceFrom: 120, priceTo: 200, etaHours: nil), updatedAt: day(0, 7),
                    source: "online", createdAt: day(0, 7), customerId: customers[5].id,
                    statusHistory: history([(.received, 0, nil)])),
            Booking(code: "NT-1M4P", status: .cancelled, mode: "shop", jobIds: [],
                    issue: "Tabletă cu ecran negru.", slot: day(-1, 12),
                    device: DeviceDetails(brand: "Lenovo", model: "Tab M10", year: nil), contact: contact(0),
                    pickup: nil, estimate: Estimate(priceFrom: 100, priceTo: 180, etaHours: nil), updatedAt: day(-1, 8),
                    source: "online", createdAt: day(-3, 20), customerId: customers[0].id,
                    statusHistory: history([(.received, -3, nil), (.cancelled, -1, "Clientul a renunțat.")])),
            Booking(code: "NT-2Q5R", status: .repairing, mode: "shop", jobIds: ["laptop-cleaning"],
                    issue: "Laptop zgomotos, se oprește la temperaturi mari.", slot: day(1, 11),
                    device: DeviceDetails(brand: "Dell", model: "Latitude 5420", year: "2021"), contact: contact(5),
                    pickup: nil, estimate: Estimate(priceFrom: 120, priceTo: 160, etaHours: [24, 24]), updatedAt: day(0, 11),
                    source: "online", createdAt: day(-1, 14), customerId: customers[5].id,
                    intake: intake(15, "Laptop", serial: "DL5420-8841", at: 0),
                    statusHistory: history([(.received, -1, nil), (.diagnosis, 0, nil), (.repairing, 0, nil)])),
            Booking(code: "NT-8S7T", status: .done, mode: "shop", jobIds: ["phone-battery"],
                    issue: "Baterie umflată.", slot: day(-160, 11),
                    device: DeviceDetails(brand: "Apple", model: "iPhone 12", year: "2020"), contact: contact(6),
                    pickup: nil, estimate: Estimate(priceFrom: 180, priceTo: 220, etaHours: nil), updatedAt: day(-160, 16),
                    source: "online", createdAt: day(-162, 9), customerId: customers[6].id,
                    intake: intake(2, "Telefon", at: -160),
                    repair: RepairNotes(diagnosis: "Baterie la 61% și umflată.", workDone: "Baterie înlocuită.", partsUsed: "Baterie iPhone 12"),
                    deliveredAt: day(-160, 16), finalLei: 210,
                    statusHistory: history([(.received, -162, nil), (.diagnosis, -160, nil), (.repairing, -160, nil), (.done, -160, nil)])),
            Booking(code: "NT-4U9V", status: .received, mode: "shop", jobIds: ["pc-cleaning"],
                    issue: "PC de birou lent, face zgomot.", slot: day(2, 10),
                    device: DeviceDetails(brand: "Custom", model: "Desktop i5", year: nil), contact: contact(3),
                    pickup: nil, estimate: Estimate(priceFrom: 100, priceTo: 150, etaHours: nil), updatedAt: day(0, 6),
                    source: "online", createdAt: day(0, 6), customerId: customers[3].id,
                    statusHistory: history([(.received, 0, nil)])),
        ]

        func warranty(_ n: Int, _ code: String, _ c: Customer, _ device: String, _ work: String, months: Int, started: Int, sheet: String?) -> Warranty {
            let start = ShopCalendar.addDays(today, started)
            let end = ShopCalendar.addMonths(start, months)
            let state: WarrantyState = end < today ? .expired : (end <= ShopCalendar.addDays(today, 30) ? .expiring : .active)
            return Warranty(id: String(format: "w%023x", n), label: "G\(n)/\(ShopCalendar.calendar.component(.year, from: Date()))", number: n,
                            year: ShopCalendar.calendar.component(.year, from: Date()), bookingCode: code, sheet: sheet, customerId: c.id,
                            customerName: c.name, device: device, work: work, months: months, startsOn: start, endsOn: end,
                            issuedAt: ShopCalendar.isoFor(day: start, hour: 12), issuedBy: "Alex (dev)", voided: nil, state: state)
        }
        let warranties = [
            warranty(3, "NT-3F8H", customers[6], "HP Pavilion 15", "Cablu video și panou înlocuite.", months: 6, started: -5, sheet: "9/2026"),
            warranty(2, "NT-8S7T", customers[6], "Apple iPhone 12", "Baterie înlocuită.", months: 6, started: -160, sheet: "2/2026"),
        ]
        return (bookings, customers, warranties)
    }
}
