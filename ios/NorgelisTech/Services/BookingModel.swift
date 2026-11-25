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

/// Snapshot kept after a successful booking so the confirmation screen can show a recap and add to Calendar.
struct BookedSummary: Equatable {
    var code: String
    var slotStart: Date
    var slotDurationHours: Int
    var slotText: String
    var kind: BookingModel.Kind
    var locationText: String
    var estimateText: String
    var transportText: String?
    var hasEmail: Bool
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
            if kind != .pickup { urgent = false }
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
    @Published var searchFailed = false
    @Published var searchDone = false
    @Published var place: GeoPlace?
    @Published var trips: Trips = .both
    @Published var urgent = false {
        didSet {
            guard urgent != oldValue else { return }
            slot = nil
            if urgent {
                if urgentAvailableToday {
                    day = todayString
                    dayMovedNote = false
                } else {
                    urgent = false
                }
            }
        }
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
    @Published var slotsLoading = false
    @Published var slotsFailed = false

    // Contact
    @Published var name = ""
    @Published var phone = ""
    @Published var email = ""

    // Result
    @Published var submitting = false
    @Published var problem: String?
    @Published var bookedCode: String?
    @Published var bookedSummary: BookedSummary?

    /// The server's limits (site/server/schema.ts). The form stops at them instead of failing with a 400.
    enum Limit {
        static let jobs = 10, custom = 500, issue = 1500, device = 60, location = 200, name = 80, email = 160, address = 200
    }

    private static let savedPhoneKey = "norgelis_last_phone"

    private let api: APIClient
    let planner: SlotPlanner
    let catalog: Catalog
    private let now: () -> Date

    init(api: APIClient, catalog: Catalog = .shared, now: @escaping () -> Date = { Date() }) {
        self.api = api
        self.catalog = catalog
        self.now = now
        self.planner = SlotPlanner(holidays: Set(catalog.holidays), now: now)
        day = firstOpenDay ?? ShopCalendar.dateString(now())
    }

    // MARK: - Derived

    var todayString: String { ShopCalendar.dateString(now()) }
    private var mobileSlots: Bool { kind == .mobile }
    private var urgentPickup: Bool { kind == .pickup && urgent }

    /// Same-day urgent pickup is only offered when today is open and still has at least one 1h-lead slot free.
    var urgentAvailableToday: Bool {
        planner.isOpen(todayString) && !planner.slots(on: todayString, mobile: false, urgent: true, taken: taken).isEmpty
    }

    /// First day that still has a window to book.
    var firstOpenDay: String? { planner.daysAhead(count: 1, mobile: mobileSlots, urgent: urgentPickup).first }
    /// What the calendar offers: from the first open day for four weeks, never past 30 days from today
    /// (`GET /api/slots` answers at most 31 days at a time).
    var dateRange: ClosedRange<Date> {
        let today = todayString
        let first = firstOpenDay ?? today
        let end = min(ShopCalendar.addDays(first, 28), ShopCalendar.addDays(today, 30))
        return ShopCalendar.date(first)...ShopCalendar.date(max(end, first))
    }

    /// The calendar picked a date. A closed day (Sunday, holiday, nothing left) moves to the next open one.
    /// Picking a future day automatically clears the same-day urgent surcharge.
    func pick(date: Date) {
        let picked = ShopCalendar.dateString(date)
        guard picked != day else { return }
        slot = nil
        dayMovedNote = false
        let clearUrgentIfNeeded = { [weak self] (chosen: String) in
            guard let self else { return }
            if self.urgent && chosen != self.todayString {
                self.urgent = false
                Task { await self.loadQuote() }
            }
        }
        if !planner.slots(on: picked, mobile: mobileSlots, urgent: urgentPickup, taken: taken).isEmpty || planner.isOpen(picked) {
            day = picked
            clearUrgentIfNeeded(picked)
            return
        }
        var next = picked
        let upper = ShopCalendar.dateString(dateRange.upperBound)
        for _ in 0..<10 {
            next = ShopCalendar.addDays(next, 1)
            // Never past the window the slots were loaded for.
            if next > upper { return }
            if planner.isOpen(next) {
                day = next
                dayMovedNote = true
                clearUrgentIfNeeded(next)
                return
            }
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
        // Close to the server's check: something@domain.tld, no spaces, a top-level domain of 2+ letters.
        return e.isEmpty || (e.count <= Limit.email && e.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$", options: .regularExpression) != nil)
    }
    var nameOK: Bool { name.trimmingCharacters(in: .whitespaces).count >= 2 }
    var jobsOK: Bool { (!jobIDs.isEmpty || hasCustom) && jobIDs.count <= Limit.jobs }
    var issueOK: Bool { issue.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 }
    var whereOK: Bool {
        switch kind {
        case .shop: return true
        case .pickup: return place != nil && quote != nil && quote?.tooFar == false
        case .mobile: return !location.trimmingCharacters(in: .whitespaces).isEmpty
        }
    }
    var isComplete: Bool { jobsOK && issueOK && whereOK && slot != nil && nameOK && phoneOK && emailOK }
    var canSubmit: Bool { isComplete && !submitting }
    var canAddJob: Bool { jobIDs.count < Limit.jobs }

    /// True once the customer typed or picked anything, so an accidental swipe-down asks before discarding.
    var hasEdits: Bool {
        bookedCode == nil && (
            !jobIDs.isEmpty || !custom.trimmed.isEmpty || !issue.trimmed.isEmpty
                || !brand.trimmed.isEmpty || !model.trimmed.isEmpty
                || !addressQuery.trimmed.isEmpty || !location.trimmed.isEmpty
        )
    }

    /// Ordered list of what is still missing before the booking can be sent, with the section id to scroll to.
    var missingItems: [(section: String, label: String)] {
        var list: [(String, String)] = []
        if !jobsOK { list.append(("what", String(localized: "booking.missing.service"))) }
        if !issueOK { list.append(("what", String(localized: "booking.missing.issue"))) }
        if !whereOK {
            if kind == .pickup {
                let key = place == nil ? "booking.missing.pickup_address" : "booking.missing.quote"
                list.append(("where", String(localized: String.LocalizationValue(key))))
            } else if kind == .mobile {
                list.append(("where", String(localized: "booking.missing.location")))
            }
        }
        if slot == nil { list.append(("when", String(localized: "booking.missing.slot"))) }
        if !nameOK { list.append(("you", String(localized: "booking.missing.name"))) }
        if !phoneOK { list.append(("you", String(localized: "booking.missing.phone"))) }
        if !emailOK { list.append(("you", String(localized: "booking.missing.email"))) }
        return list
    }

    // MARK: - Loading

    private static var lang: String { Locale.current.language.languageCode?.identifier == "en" ? "en" : "ro" }

    func prefill(from viewer: Viewer?, knownPhone: String? = nil) {
        if let viewer {
            if name.isEmpty { name = viewer.name }
            if email.isEmpty { email = viewer.email }
        }
        if phone.isEmpty {
            let fallback = knownPhone?.trimmed
            if let fallback, !fallback.isEmpty {
                phone = fallback
            } else if let saved = UserDefaults.standard.string(forKey: Self.savedPhoneKey), !saved.isEmpty {
                phone = saved
            }
        }
    }

    func search() async {
        let q = addressQuery.trimmingCharacters(in: .whitespaces)
        searchFailed = false
        guard q.count >= 3, q != place?.label else {
            places = []
            searchDone = false
            return
        }
        try? await Task.sleep(nanoseconds: 350_000_000)
        guard !Task.isCancelled else { return }
        searching = true
        searchDone = false
        defer { searching = false }
        struct Reply: Decodable { var results: [GeoPlace] }
        do {
            let reply: Reply = try await api.request("GET", "api/geo/search", query: [
                URLQueryItem(name: "q", value: q), URLQueryItem(name: "lang", value: Self.lang),
            ])
            if !Task.isCancelled {
                places = reply.results
                searchDone = true
            }
        } catch is CancellationError {
            return
        } catch {
            if !Task.isCancelled {
                places = []
                searchFailed = true
                searchDone = true
            }
        }
    }

    func choose(_ p: GeoPlace) {
        place = p
        addressQuery = p.label
        places = []
        searchFailed = false
        searchDone = false
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
        slotsLoading = true
        slotsFailed = false
        defer { slotsLoading = false }
        let first = todayString
        let last = ShopCalendar.addDays(first, 30)
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
        if urgent && !urgentAvailableToday {
            urgent = false
            await loadQuote()
        }
        if let open = firstOpenDay, day < open { day = open }
        // Invalidate an early slot tap if the loaded taken set excludes it.
        if let chosen = slot, !slots.contains(chosen) { slot = nil }
    }

    // MARK: - Submit

    /// The JSON for `POST /api/bookings`, or nil while the form is not complete.
    func requestBody() -> [String: Any]? {
        guard isComplete, let slot else { return nil }
        var device: [String: Any] = [:]
        if !brand.trimmed.isEmpty { device["brand"] = String(brand.trimmed.prefix(Limit.device)) }
        if !model.trimmed.isEmpty { device["model"] = String(model.trimmed.prefix(Limit.device)) }
        if needsYear, !year.trimmed.isEmpty { device["year"] = String(year.trimmed.prefix(Limit.device)) }
        var contact: [String: Any] = ["name": String(name.trimmed.prefix(Limit.name)), "phone": phone.trimmed]
        if !email.trimmed.isEmpty { contact["email"] = email.trimmed }
        let est = estimate
        var body: [String: Any] = [
            "mode": kind.jobMode.rawValue,
            "jobIds": Array(jobIDs).sorted(),
            "device": device,
            "issue": String(issue.trimmed.prefix(Limit.issue)),
            "slot": slot.iso,
            "contact": contact,
            "estimate": ["priceFrom": est.from, "priceTo": est.to, "etaHours": est.etaHours],
            "lang": Self.lang,
        ]
        if hasCustom { body["custom"] = String(custom.trimmed.prefix(Limit.custom)) }
        if usesValue, let value { body["deviceValue"] = value.rawValue }
        if kind == .mobile { body["location"] = String(location.trimmed.prefix(Limit.location)) }
        if kind == .pickup, let place, let quote {
            body["pickup"] = [
                "address": String(place.label.prefix(Limit.address)), "lat": place.lat, "lon": place.lon, "trips": trips.rawValue, "urgent": urgent,
                "quote": ["totalLei": quote.totalLei, "oneWayKm": quote.oneWayKm],
            ] as [String: Any]
        }
        return body
    }

    func submit() async {
        guard canSubmit, let slot, let body = requestBody() else { return }
        submitting = true
        problem = nil
        defer { submitting = false }

        struct Reply: Decodable { var code: String }
        do {
            let reply: Reply = try await api.request("POST", "api/bookings", body: body)
            // Remember the phone locally so the next booking doesn't ask for it again.
            UserDefaults.standard.set(phone.trimmed, forKey: Self.savedPhoneKey)
            let est = estimate
            let estimateText = est.to > 0 ? Money.range(est.from, est.to) : String(localized: "booking.price.after_diagnosis")
            let placeText: String
            switch kind {
            case .shop: placeText = Shop.address
            case .pickup: placeText = place?.label ?? Shop.address
            case .mobile: placeText = location.trimmed
            }
            bookedSummary = BookedSummary(
                code: reply.code,
                slotStart: slot.start,
                slotDurationHours: kind == .mobile ? 2 : 1,
                slotText: ShopCalendar.dateTime(slot.iso),
                kind: kind,
                locationText: placeText,
                estimateText: estimateText,
                transportText: transportLei.map { Money.lei($0) },
                hasEmail: !email.trimmed.isEmpty
            )
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
