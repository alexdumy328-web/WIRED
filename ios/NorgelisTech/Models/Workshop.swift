import Foundation

// Shapes for the owner console. They follow site/src/types.ts and site/src/auth/owner/types.ts.

/// Who is signed in to the console. Technicians work on devices; owners also see money, stats and settings.
enum StaffRole: String, CaseIterable, Identifiable, Codable {
    case driver, technician, owner, dev

    var id: String { rawValue }
    var isManager: Bool { self == .owner || self == .dev }
    var isDriver: Bool { self == .driver }
    var titleKey: String { "console.role.\(rawValue)" }
}

struct Page<Item: Codable>: Codable {
    var total: Int
    var items: [Item]
}

struct StatusEntry: Codable, Hashable {
    var status: BookingStatus
    var at: String
    var by: String
    var byId: String?
    var note: String?
}

/// A numbered service sheet, filled in when the device is handed in.
struct Intake: Codable, Hashable {
    var number: Int
    var year: Int
    var receivedAt: String
    var deviceType: String
    var serial: String?
    var accessories: String?
    var appearance: String?
    /// Who took the device in. The customer view of a booking leaves it out.
    var by: String?

    /// "12/2026"
    var label: String { "\(number)/\(year)" }
}

struct RepairNotes: Codable, Hashable {
    var diagnosis: String?
    var workDone: String?
    var partsUsed: String?
}

enum ContactChannel: String, CaseIterable, Codable, Identifiable {
    case phone, sms, whatsapp, email
    var id: String { rawValue }
    var titleKey: String { "console.channel.\(rawValue)" }
}

struct CompanyRef: Codable, Hashable {
    var name: String?
    var cui: String?
    var regCom: String?
}

struct Customer: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var phone: String?
    var email: String?
    var company: CompanyRef?
    var address: String?
    var notes: String?
    var preferred: ContactChannel
    var createdAt: String
    var updatedAt: String
    var archived: Bool?
    // Only on list rows
    var jobs: Int?
    var open: Int?
    var lastVisit: String?
}

/// Body for creating or editing a customer. Empty strings clear a field.
struct CustomerInput: Codable, Hashable {
    var name = ""
    var phone = ""
    var email = ""
    var company = CompanyRef(name: "", cui: "", regCom: "")
    var address = ""
    var notes = ""
    var preferred: ContactChannel = .phone

    init() {}

    init(_ c: Customer) {
        name = c.name
        phone = c.phone ?? ""
        email = c.email ?? ""
        company = CompanyRef(name: c.company?.name ?? "", cui: c.company?.cui ?? "", regCom: c.company?.regCom ?? "")
        address = c.address ?? ""
        notes = c.notes ?? ""
        preferred = c.preferred
    }
}

enum WarrantyState: String, Codable {
    case active, expiring, expired, void
}

struct Warranty: Codable, Identifiable, Hashable {
    struct Voided: Codable, Hashable {
        var at: String
        var by: String
        var reason: String
    }

    var id: String
    var label: String
    var number: Int
    var year: Int
    var bookingCode: String
    var sheet: String?
    var customerId: String?
    var customerName: String
    var device: String
    var work: String
    var months: Int
    var startsOn: String
    var endsOn: String
    var issuedAt: String
    var issuedBy: String
    var voided: Voided?
    var state: WarrantyState
}

struct CustomerDetail: Codable {
    var customer: Customer
    var jobs: [Booking]
    var warranties: [Warranty]
}

/// `GET /api/admin/bookings/:code`: the booking plus what the drawer needs around it.
struct BookingDetail: Decodable {
    struct Defaults: Decodable {
        var warrantyMonths: Int?
    }

    var booking: Booking
    var warranties: [Warranty]
    var customer: Customer?
    var defaults: Defaults?

    private enum Extra: String, CodingKey {
        case warranties, customer, defaults
    }

    init(from decoder: Decoder) throws {
        booking = try Booking(from: decoder)
        let c = try decoder.container(keyedBy: Extra.self)
        warranties = try c.decodeIfPresent([Warranty].self, forKey: .warranties) ?? []
        customer = try c.decodeIfPresent(Customer.self, forKey: .customer)
        defaults = try c.decodeIfPresent(Defaults.self, forKey: .defaults)
    }

    init(booking: Booking, warranties: [Warranty] = [], customer: Customer? = nil, defaults: Defaults? = nil) {
        self.booking = booking
        self.warranties = warranties
        self.customer = customer
        self.defaults = defaults
    }
}

struct WarrantyCounts: Codable, Hashable {
    var valid: Int
    var expiring: Int
}

/// `GET /api/admin/counts`: numbers every staff member may see, no money.
struct StaffCounts: Codable {
    var byStatus: [String: Int]
    var warranties: WarrantyCounts

    func count(_ status: BookingStatus) -> Int { byStatus[status.rawValue] ?? 0 }
    var active: Int {
        count(.received) + count(.diagnosis) + count(.waitingParts) + count(.repairing)
    }
    var handback: Int { count(.ready) + count(.unrepairable) }
}

// MARK: - Schedule

struct CalendarSlot: Codable, Hashable, Identifiable {
    var slot: String
    var code: String
    var mode: String
    var status: BookingStatus
    var name: String
    var device: String
    var pickup: Bool

    var id: String { code }
    var kind: JobKind {
        if mode == "mobile" { return .mobile }
        return pickup ? .pickup : .shop
    }
}

struct CalendarDay: Codable, Hashable {
    var date: String
    var slots: [CalendarSlot]
}

struct CalendarWeek: Codable {
    var weekStart: String
    var days: [CalendarDay]
}

struct PickupWindow: Codable, Hashable {
    var from: String
    var to: String
}

struct PickupJob: Codable, Hashable, Identifiable {
    var code: String
    var status: BookingStatus
    var slot: String
    var window: PickupWindow
    var trips: PickupTrips
    var urgent: Bool
    var address: String
    var lat: Double
    var lon: Double
    var mapLink: String?
    var name: String
    var phone: String
    var device: String
    var quoteLei: Double
    /// From the driver's run (`/api/driver/pickups`): what the driver does there, and whether it is done.
    var leg: String?
    var completed: Bool?

    var id: String { code }
}

struct PickupsResponse: Codable {
    var date: String
    var jobs: [PickupJob]
}

// MARK: - Stats

struct TrendPoint: Codable, Hashable, Identifiable {
    var start: String
    var created: Int
    var done: Int
    var bookedLei: Double
    var doneLei: Double
    var transportLei: Double

    var id: String { start }
}

struct WeekCount: Codable, Hashable, Identifiable {
    var weekStart: String
    var count: Int
    var id: String { weekStart }
}

struct StatsRevenue: Codable, Hashable {
    var doneLei: Double
    var pipelineLei: Double
}

struct StatsTrend: Codable, Hashable {
    var weekly: [TrendPoint]
    var monthly: [TrendPoint]
}

struct Stats: Codable {
    var weeks: [WeekCount]
    var trend: StatsTrend?
    var byCategory: [String: Int]
    var byStatus: [String: Int]
    var total: Int
    var active: Int
    var revenue: StatsRevenue
    var warranties: WarrantyCounts?
}

// MARK: - Settings

struct PickupRates: Codable, Hashable {
    var dieselLeiPerL: Double
    var consumptionLPer100: Double
    var driverLeiPerHour: Double
    var stopMinutes: Double
    var minTripLei: Double
    var urgentFactor: Double
    var maxKm: Double
}

struct ValueRates: Codable, Hashable {
    var low: Double
    var mid: Double
    var high: Double
    var premium: Double
}

struct ConsumablesFactors: Codable, Hashable {
    var low: Double
    var medium: Double
    var high: Double
}

struct LabourRates: Codable, Hashable {
    var valueRate: ValueRates
    var consumablesFactor: ConsumablesFactors
}

struct CompanyDetails: Codable, Hashable {
    var name = ""
    var cui = ""
    var regCom = ""
    var address = ""
    var phone = ""
    var email = ""
    var iban = ""
    var bank = ""
}

struct DocumentSettings: Codable, Hashable {
    var intakeTerms: String
    var warrantyTerms: String
    var warrantyMonths: [String: Int]
}

struct ShopSettings: Codable, Hashable {
    var pickup: PickupRates
    var labour: LabourRates
    var company: CompanyDetails
    var documents: DocumentSettings
    var updatedAt: String?
}

// MARK: - Requests

/// Filters for the jobs list.
/// How the jobs list is ordered. The raw values are the server's `sort` parameter.
enum JobSort: String, CaseIterable, Identifiable, Hashable {
    case slotDesc = "slot_desc", slotAsc = "slot_asc", upcoming, updated, created

    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .slotDesc: return "console.sort.slot_desc"
        case .slotAsc: return "console.sort.slot_asc"
        case .upcoming: return "console.sort.upcoming"
        case .updated: return "console.sort.updated"
        case .created: return "console.sort.created"
        }
    }

    var icon: String {
        switch self {
        case .slotDesc: return "arrow.down"
        case .slotAsc: return "arrow.up"
        case .upcoming: return "calendar.badge.clock"
        case .updated: return "clock.arrow.circlepath"
        case .created: return "plus.circle"
        }
    }
}

struct BookingQuery: Hashable {
    /// A status, or "handback" for ready and unrepairable together.
    var status: String?
    var mode: AdminBookingMode?
    var text = ""
    var intake: Bool?
    var sort: JobSort = .slotDesc
    var limit = 50
    var skip = 0
}

enum PriceChange: Hashable {
    case keep
    case set(Int)
    case clear
}

struct StatusUpdate {
    var status: BookingStatus
    var note: String?
    var price: PriceChange = .keep
    var notify = true
    /// A field sent as "" is cleared; a nil one is kept.
    var repair: RepairNotes?
}

struct IntakeInput: Hashable {
    var deviceType = ""
    var serial = ""
    var accessories = ""
    var appearance = ""
    var email = true
}

struct WalkInInput {
    var customerId: String?
    var customer: CustomerInput?
    var brand = ""
    var model = ""
    var intake = IntakeInput()
    var issue = ""
    var priceFrom = 0
    var priceTo = 0
    var lang = "ro"
}
