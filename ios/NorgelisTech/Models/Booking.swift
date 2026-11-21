import Foundation

struct DeviceDetails: Codable, Hashable {
    var brand: String?
    var model: String?
    var year: String?

    var displayName: String {
        let items = [brand, model, year].compactMap { $0 }.filter { !$0.isEmpty }
        return items.isEmpty ? "Dispozitiv nespecificat" : items.joined(separator: " ")
    }
}

struct ContactInfo: Codable, Hashable {
    var name: String?
    var phone: String?
    var email: String?
}

struct PickupQuote: Codable, Hashable {
    var totalLei: Double?
    var oneWayKm: Double?
    var urgentLei: Double?
}

enum PickupTrips: String, Codable, Hashable {
    case both = "both"
    case pickup = "pickup"
    case dropoff = "dropoff"

    var localizedTitleKey: String {
        switch self {
        case .both: return "driver.pickup.type.both"
        case .pickup: return "driver.pickup.type.pickup"
        case .dropoff: return "driver.pickup.type.dropoff"
        }
    }
}

struct PickupDetails: Codable, Hashable {
    var address: String
    var lat: Double
    var lon: Double
    var trips: PickupTrips?
    var urgent: Bool?
    var quote: PickupQuote?
}

struct Estimate: Codable, Hashable {
    var priceFrom: Double
    var priceTo: Double
    var etaHours: [Double]?

    /// The site shows "After diagnosis" instead of a price when the top of the range is 0.
    var hasPrice: Bool { priceTo > 0 }
}

struct Booking: Codable, Identifiable, Hashable {
    var code: String
    var status: BookingStatus
    var mode: String? // "shop" or "mobile"; a shop job with a pickup is the "pickup" kind
    var jobIds: [String]?
    var issue: String?
    var slot: String?
    var device: DeviceDetails?
    var contact: ContactInfo?
    var pickup: PickupDetails?
    var estimate: Estimate?
    var updatedAt: String?

    var id: String { code }

    var hasPickup: Bool {
        pickup != nil
    }

    var kind: JobKind {
        if mode == "mobile" { return .mobile }
        return pickup != nil ? .pickup : .shop
    }
}
