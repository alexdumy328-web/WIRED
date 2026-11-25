import Foundation

/// Everything the owner console reads and writes. `LiveOwnerRepository` talks to the API and
/// `MockOwnerRepository` keeps sample data in memory, so every screen works without a server.
protocol OwnerRepository {
    var isLive: Bool { get }

    func role() async throws -> StaffRole
    func counts() async throws -> StaffCounts

    func bookings(_ query: BookingQuery) async throws -> Page<Booking>
    func booking(code: String) async throws -> BookingDetail
    func updateStatus(code: String, update: StatusUpdate) async throws -> Booking
    func createIntake(code: String, input: IntakeInput) async throws -> Booking
    func editIntake(code: String, input: IntakeInput) async throws -> Booking
    func walkIn(_ input: WalkInInput) async throws -> Booking

    func customers(text: String, archived: Bool, limit: Int, skip: Int) async throws -> Page<Customer>
    func customer(id: String) async throws -> CustomerDetail
    func createCustomer(_ input: CustomerInput) async throws -> Customer
    func updateCustomer(id: String, input: CustomerInput) async throws -> Customer
    func archiveCustomer(id: String, archived: Bool) async throws -> Customer

    func warranties(text: String, state: String?, limit: Int, skip: Int) async throws -> Page<Warranty>
    func issueWarranty(code: String, months: Int?, work: String?, email: Bool) async throws -> Warranty
    func voidWarranty(id: String, reason: String) async throws -> Warranty

    func calendar(week: String) async throws -> CalendarWeek
    func busy(from: String, to: String) async throws -> [String: BusyDaySummary]
    func pickups(date: String) async throws -> PickupsResponse

    func stats() async throws -> Stats
    func settings() async throws -> ShopSettings
    func saveSettings(_ settings: ShopSettings) async throws -> ShopSettings

    /// A PDF to share or print. Only the live API makes these.
    func pdf(path: String, fileName: String) async throws -> URL
}

// MARK: - Live

final class LiveOwnerRepository: OwnerRepository {
    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    var isLive: Bool { true }

    private struct MeResponse: Decodable {
        struct User: Decodable { var role: String? }
        var user: User?
    }

    func role() async throws -> StaffRole {
        let me: MeResponse = try await api.request("GET", "api/me")
        guard let raw = me.user?.role, let role = StaffRole(rawValue: raw) else { throw APIError.forbidden }
        return role
    }

    func counts() async throws -> StaffCounts {
        try await api.request("GET", "api/admin/counts")
    }

    func bookings(_ q: BookingQuery) async throws -> Page<Booking> {
        var items = [URLQueryItem(name: "limit", value: String(q.limit)), URLQueryItem(name: "skip", value: String(q.skip))]
        if let status = q.status { items.append(URLQueryItem(name: "status", value: status)) }
        if let mode = q.mode { items.append(URLQueryItem(name: "mode", value: mode.rawValue)) }
        let text = q.text.trimmingCharacters(in: .whitespaces)
        if !text.isEmpty { items.append(URLQueryItem(name: "q", value: text)) }
        if let intake = q.intake { items.append(URLQueryItem(name: "intake", value: intake ? "yes" : "no")) }
        if q.sort != .slotDesc { items.append(URLQueryItem(name: "sort", value: q.sort.rawValue)) }
        return try await api.request("GET", "api/admin/bookings", query: items)
    }

    func booking(code: String) async throws -> BookingDetail {
        try await api.request("GET", "api/admin/bookings/\(code)")
    }

    func updateStatus(code: String, update: StatusUpdate) async throws -> Booking {
        var body: [String: Any] = ["status": update.status.rawValue, "notify": update.notify]
        if let note = update.note, !note.isEmpty { body["note"] = note }
        switch update.price {
        case .keep: break
        case .set(let lei): body["finalLei"] = lei
        case .clear: body["finalLei"] = NSNull()
        }
        if let repair = update.repair {
            var fields: [String: String] = [:]
            if let v = repair.diagnosis { fields["diagnosis"] = v }
            if let v = repair.workDone { fields["workDone"] = v }
            if let v = repair.partsUsed { fields["partsUsed"] = v }
            if !fields.isEmpty { body["repair"] = fields }
        }
        return try await api.request("PATCH", "api/admin/bookings/\(code)/status", body: body)
    }

    private func intakeFields(_ input: IntakeInput) -> [String: Any] {
        var body: [String: Any] = ["deviceType": input.deviceType]
        if !input.serial.isEmpty { body["serial"] = input.serial }
        if !input.accessories.isEmpty { body["accessories"] = input.accessories }
        if !input.appearance.isEmpty { body["appearance"] = input.appearance }
        return body
    }

    func createIntake(code: String, input: IntakeInput) async throws -> Booking {
        var body = intakeFields(input)
        body["email"] = input.email
        return try await api.request("POST", "api/admin/bookings/\(code)/intake", body: body)
    }

    func editIntake(code: String, input: IntakeInput) async throws -> Booking {
        try await api.request("PATCH", "api/admin/bookings/\(code)/intake", body: [
            "deviceType": input.deviceType,
            "serial": input.serial,
            "accessories": input.accessories,
            "appearance": input.appearance,
        ])
    }

    func walkIn(_ input: WalkInInput) async throws -> Booking {
        var body = intakeFields(input.intake)
        body["email"] = input.intake.email
        body["issue"] = input.issue
        body["lang"] = input.lang
        body["device"] = ["brand": input.brand, "model": input.model].filter { !$0.value.isEmpty }
        body["estimate"] = ["priceFrom": input.priceFrom, "priceTo": input.priceTo]
        if let id = input.customerId {
            body["customerId"] = id
        } else if let customer = input.customer {
            body["customer"] = Self.customerBody(customer)
        }
        return try await api.request("POST", "api/admin/walk-ins", body: body)
    }

    private static func customerBody(_ c: CustomerInput) -> [String: Any] {
        var body: [String: Any] = ["name": c.name, "phone": c.phone, "email": c.email, "address": c.address, "notes": c.notes, "preferred": c.preferred.rawValue]
        var company: [String: String] = [:]
        if let v = c.company.name, !v.isEmpty { company["name"] = v }
        if let v = c.company.cui, !v.isEmpty { company["cui"] = v }
        if let v = c.company.regCom, !v.isEmpty { company["regCom"] = v }
        body["company"] = company
        return body
    }

    func customers(text: String, archived: Bool, limit: Int, skip: Int) async throws -> Page<Customer> {
        var items = [URLQueryItem(name: "limit", value: String(limit)), URLQueryItem(name: "skip", value: String(skip))]
        let q = text.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty { items.append(URLQueryItem(name: "q", value: q)) }
        if archived { items.append(URLQueryItem(name: "archived", value: "yes")) }
        return try await api.request("GET", "api/admin/customers", query: items)
    }

    func customer(id: String) async throws -> CustomerDetail {
        try await api.request("GET", "api/admin/customers/\(id)")
    }

    func createCustomer(_ input: CustomerInput) async throws -> Customer {
        try await api.request("POST", "api/admin/customers", body: Self.customerBody(input))
    }

    func updateCustomer(id: String, input: CustomerInput) async throws -> Customer {
        try await api.request("PATCH", "api/admin/customers/\(id)", body: Self.customerBody(input))
    }

    func archiveCustomer(id: String, archived: Bool) async throws -> Customer {
        try await api.request("POST", "api/admin/customers/\(id)/archive", body: ["archived": archived])
    }

    func warranties(text: String, state: String?, limit: Int, skip: Int) async throws -> Page<Warranty> {
        var items = [URLQueryItem(name: "limit", value: String(limit)), URLQueryItem(name: "skip", value: String(skip))]
        let q = text.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty { items.append(URLQueryItem(name: "q", value: q)) }
        if let state { items.append(URLQueryItem(name: "state", value: state)) }
        return try await api.request("GET", "api/admin/warranties", query: items)
    }

    func issueWarranty(code: String, months: Int?, work: String?, email: Bool) async throws -> Warranty {
        var body: [String: Any] = ["email": email]
        if let months { body["months"] = months }
        if let work, !work.isEmpty { body["work"] = work }
        return try await api.request("POST", "api/admin/bookings/\(code)/warranty", body: body)
    }

    func voidWarranty(id: String, reason: String) async throws -> Warranty {
        try await api.request("POST", "api/admin/warranties/\(id)/void", body: ["reason": reason])
    }

    func calendar(week: String) async throws -> CalendarWeek {
        try await api.request("GET", "api/admin/calendar", query: [URLQueryItem(name: "week", value: week)])
    }

    func busy(from: String, to: String) async throws -> [String: BusyDaySummary] {
        try await api.fetchAdminBusy(from: from, to: to)
    }

    func pickups(date: String) async throws -> PickupsResponse {
        try await api.request("GET", "api/admin/pickups", query: [URLQueryItem(name: "date", value: date)])
    }

    func stats() async throws -> Stats {
        try await api.request("GET", "api/admin/stats")
    }

    func settings() async throws -> ShopSettings {
        try await api.request("GET", "api/admin/settings")
    }

    func saveSettings(_ s: ShopSettings) async throws -> ShopSettings {
        let encoder = JSONEncoder()
        let data = try encoder.encode(ShopSettingsPatch(pickup: s.pickup, labour: s.labour, company: s.company, documents: s.documents))
        let body = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
        return try await api.request("PUT", "api/admin/settings", body: body)
    }

    func pdf(path: String, fileName: String) async throws -> URL {
        try await api.download(path, fileName: fileName)
    }
}

/// PUT body. The API refuses unknown keys, so `updatedAt` stays out.
private struct ShopSettingsPatch: Encodable {
    var pickup: PickupRates
    var labour: LabourRates
    var company: CompanyDetails
    var documents: DocumentSettings
}
