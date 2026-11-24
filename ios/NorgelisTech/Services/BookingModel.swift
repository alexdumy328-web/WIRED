import SwiftUI

struct GeoPlace: Decodable, Hashable {
    var label: String
    var lat: Double
    var lon: Double
    var city: String?
}

/// The part of `/api/pickup/quote` the form shows.
struct PickupQuoteInfo: Decodable, Equatable {
    var totalLei: Double
    var oneWayKm: Double
    var urgentLei: Double?
    var tooFar: Bool
}

/// State of the booking form. It posts to the same `POST /api/bookings` the website uses, so the server
/// checks the jobs, the slot and the prices again and these numbers are only for showing.
@MainActor
final class BookingModel: ObservableObject {
    enum Kind: String, CaseIterable, Identifiable {
        case shop, pickup, mobile
        var id: String { rawValue }
        var jobMode: CatalogJob.Mode { self == .mobile ? .mobile : .shop }
        var titleKey: String { "kind.\(rawValue)" }
    }

    enum Trips: String, CaseIterable, Identifiable {
        case both, pickup, dropoff
        var id: String { rawValue }
        var titleKey: String { "booking.trips.\(rawValue)" }
    }

    @Published var kind: Kind = .shop {
        didSet {
            guard kind != oldValue else { return }
            if kind.jobMode != oldValue.jobMode { jobIDs = [] }
            slot = nil
            Task { await loadTaken() }
        }
    }
    @Published var jobIDs: Set<String> = []
    @Published var custom = ""
    @Published var brand = ""
    @Published var model = ""
    @Published var year = ""
    @Published var issue = ""
    @Published var value: DeviceValue?

    // Pickup and on-site
    @Published var addressQuery = ""
    @Published var places: [GeoPlace] = []
    @Published var searching = false
    @Published var place: GeoPlace?
    @Published var trips: Trips = .both
    @Published var urgent = false {
        didSet { if urgent != oldValue { slot = nil } }
    }
    @Published var quote: PickupQuoteInfo?
    @Published var quoting = false
    @Published var quoteFailed = false
    @Published var location = ""

    // Time
    @Published var day = ""
    /// Set when the picked date was closed and the form moved to the next open day.
    @Published var dayMovedNote = false
    @Published var slot: SlotPlanner.Slot?
    @Published private(set) var taken: Set<String> = []
    @Published var slotsFailed = false

    // Contact
    @Published var name = ""
    @Published var phone = ""
    @Published var email = ""

    // Result
    @Published var submitting = false
    @Published var problem: String?
    @Published var bookedCode: String?

    private let api: APIClient
    let planner: SlotPlanner
    let catalog: Catalog

    init(api: APIClient, catalog: Catalog = .shared) {
        self.api = api
        self.catalog = catalog
        self.planner = SlotPlanner(holidays: Set(catalog.holidays))
        day = firstOpenDay ?? ShopCalendar.dateString()
    }

    // MARK: - Derived

    private var mobileSlots: Bool { kind == .mobile }
    private var urgentPickup: Bool { kind == .pickup && urgent }
    /// First day that still has a window to book.
    var firstOpenDay: String? { planner.daysAhead(count: 1, mobile: mobileSlots, urgent: urgentPickup).first }
    /// What the calendar offers: from the first open day for the next four weeks.
    var dateRange: ClosedRange<Date> {
        let start = ShopCalendar.date(firstOpenDay ?? ShopCalendar.dateString())
        return start...ShopCalendar.date(ShopCalendar.addDays(ShopCalendar.dateString(start), 28))
    }

    /// The calendar picked a date. A closed day (Sunday, holiday, nothing left) moves to the next open one.
    func pick(date: Date) {
        let picked = ShopCalendar.dateString(date)
        guard picked != day else { return }
        slot = nil
        dayMovedNote = false
        if !planner.slots(on: picked, mobile: mobileSlots, urgent: urgentPickup, taken: taken).isEmpty || planner.isOpen(picked) {
            day = picked
            return
        }
        var next = picked
        for _ in 0..<10 {
            next = ShopCalendar.addDays(next, 1)
            if planner.isOpen(next) { day = next; dayMovedNote = true; return }
        }
    }
    var availableJobs: [CatalogJob] { catalog.jobs(for: kind.jobMode) }
    var selectedJobs: [CatalogJob] { availableJobs.filter { jobIDs.contains($0.id) } }
    var hasCustom: Bool { !custom.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    var usesValue: Bool { selectedJobs.contains { $0.usesDeviceValue } }
    var estimate: PriceEstimate { PriceEstimate(jobs: selectedJobs, hasCustom: hasCustom, value: value) }
    var slots: [SlotPlanner.Slot] {
        planner.slots(on: day, mobile: kind == .mobile, urgent: kind == .pickup && urgent, taken: taken)
    }
    var transportLei: Double? { kind == .pickup ? quote?.totalLei : nil }
    var needsYear: Bool { kind == .mobile }

    nonisolated static func validPhone(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespaces)
        return (8...20).contains(t.count) && t.allSatisfy { "+0123456789 ()-".contains($0) }
    }

    var phoneOK: Bool { Self.validPhone(phone) }
    var emailOK: Bool {
        let e = email.trimmingCharacters(in: .whitespaces)
        return e.isEmpty || (e.contains("@") && e.contains(".") && e.count >= 5)
    }
    var nameOK: Bool { name.trimmingCharacters(in: .whitespaces).count >= 2 }
    var jobsOK: Bool { !jobIDs.isEmpty || hasCustom }
    var issueOK: Bool { issue.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 }
    var whereOK: Bool {
        switch kind {
        case .shop: return true
        case .pickup: return place != nil && quote != nil && quote?.tooFar == false
        case .mobile: return !location.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }
    var canSubmit: Bool { jobsOK && issueOK && whereOK && slot != nil && nameOK && phoneOK && emailOK && !submitting }

    // MARK: - Loading

    private static var lang: String { Locale.current.language.languageCode?.identifier == "en" ? "en" : "ro" }

    func prefill(from viewer: Viewer?) {
        guard let viewer else { return }
        if name.isEmpty { name = viewer.name }
        if email.isEmpty { email = viewer.email }
    }

    func search() async {
        let q = addressQuery.trimmingCharacters(in: .whitespaces)
        guard q.count >= 3, q != place?.label else { places = []; return }
        try? await Task.sleep(nanoseconds: 350_000_000)
        guard !Task.isCancelled else { return }
        searching = true
        defer { searching = false }
        struct Reply: Decodable { var results: [GeoPlace] }
        do {
            let reply: Reply = try await api.request("GET", "api/geo/search", query: [
                URLQueryItem(name: "q", value: q), URLQueryItem(name: "lang", value: Self.lang),
            ])
            if !Task.isCancelled { places = reply.results }
        } catch {
            if !Task.isCancelled { places = [] }
        }
    }

    func choose(_ p: GeoPlace) {
        place = p
        addressQuery = p.label
        places = []
        Task { await loadQuote() }
    }

    func loadQuote() async {
        guard let place else { quote = nil; return }
        quoting = true
        quoteFailed = false
        defer { quoting = false }
        do {
            quote = try await api.request("GET", "api/pickup/quote", query: [
                URLQueryItem(name: "lat", value: "\(place.lat)"), URLQueryItem(name: "lon", value: "\(place.lon)"),
                URLQueryItem(name: "trips", value: trips.rawValue), URLQueryItem(name: "urgent", value: urgent ? "1" : "0"),
            ])
        } catch is CancellationError {
            return
        } catch {
            quote = nil
            quoteFailed = true
        }
    }

    func loadTaken() async {
        slotsFailed = false
        let first = ShopCalendar.dateString()
        let last = ShopCalendar.addDays(first, 28)
        do {
            struct Reply: Decodable { var taken: [String] }
            let reply: Reply = try await api.request("GET", "api/slots", query: [
                URLQueryItem(name: "mode", value: kind == .mobile ? "mobile" : "shop"),
                URLQueryItem(name: "from", value: first), URLQueryItem(name: "to", value: last),
            ])
            taken = Set(reply.taken)
        } catch is CancellationError {
            return
        } catch {
            slotsFailed = true
        }
        if let open = firstOpenDay, day < open { day = open }
    }

    // MARK: - Submit

    func submit() async {
        guard canSubmit, let slot else { return }
        submitting = true
        problem = nil
        defer { submitting = false }

        var device: [String: Any] = [:]
        if !brand.trimmed.isEmpty { device["brand"] = brand.trimmed }
        if !model.trimmed.isEmpty { device["model"] = model.trimmed }
        if needsYear, !year.trimmed.isEmpty { device["year"] = year.trimmed }
        var contact: [String: Any] = ["name": name.trimmed, "phone": phone.trimmed]
        if !email.trimmed.isEmpty { contact["email"] = email.trimmed }
        let est = estimate
        var body: [String: Any] = [
            "mode": kind.jobMode.rawValue,
            "jobIds": Array(jobIDs),
            "device": device,
            "issue": issue.trimmed,
            "slot": slot.iso,
            "contact": contact,
            "estimate": ["priceFrom": est.from, "priceTo": est.to, "etaHours": est.etaHours],
            "lang": Self.lang,
        ]
        if hasCustom { body["custom"] = custom.trimmed }
        if usesValue, let value { body["deviceValue"] = value.rawValue }
        if kind == .mobile { body["location"] = location.trimmed }
        if kind == .pickup, let place, let quote {
            body["pickup"] = [
                "address": place.label, "lat": place.lat, "lon": place.lon, "trips": trips.rawValue, "urgent": urgent,
                "quote": ["totalLei": quote.totalLei, "oneWayKm": quote.oneWayKm],
            ] as [String: Any]
        }

        struct Reply: Decodable { var code: String }
        do {
            let reply: Reply = try await api.request("POST", "api/bookings", body: body)
            bookedCode = reply.code
        } catch APIError.conflict {
            problem = "booking.error.slot_taken"
            self.slot = nil
            await loadTaken()
        } catch APIError.networkError {
            problem = "booking.error.offline"
        } catch {
            problem = "booking.error.generic"
        }
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
