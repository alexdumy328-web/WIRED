import Foundation

/// A text in both languages, as the site's price list has it.
struct LocalizedText: Codable, Hashable {
    var ro: String
    var en: String

    var text: String { Locale.current.language.languageCode?.identifier == "en" ? en : ro }
}

/// What the device is worth today. It sets the hourly rate for some jobs.
enum DeviceValue: String, CaseIterable, Identifiable {
    case low, mid, high, premium
    var id: String { rawValue }
    var titleKey: String { "booking.value.\(rawValue)" }
}

/// One job from the website's price list. `catalog.json` is generated from the site (ios/scripts/export-catalog.mjs).
struct CatalogJob: Codable, Identifiable, Hashable {
    enum Mode: String, Codable { case shop, mobile }

    var id: String
    var category: String
    var mode: Mode
    var name: LocalizedText
    var description: LocalizedText
    var priceFrom: Double
    var priceTo: Double
    var etaHours: [Double]
    var needsDiagnosis: Bool
    var partsExtra: Bool
    /// Price by device value, for jobs billed by the hour.
    var byValue: [String: [Double]]?

    func price(for value: DeviceValue?) -> (from: Double, to: Double) {
        if let value, let tier = byValue?[value.rawValue], tier.count == 2 { return (tier[0], tier[1]) }
        return (priceFrom, priceTo)
    }

    var usesDeviceValue: Bool { byValue != nil }
}

struct Catalog: Decodable {
    var jobs: [CatalogJob]
    var holidays: [String]

    static let categoryOrder = ["laptop", "pc", "board", "coffee", "appliance", "it", "vintage", "auto"]

    /// The price list shipped inside the app. Empty if the file is missing, which a test catches.
    static let shared: Catalog = {
        guard let url = Bundle.main.url(forResource: "catalog", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let catalog = try? JSONDecoder().decode(Catalog.self, from: data) else {
            return Catalog(jobs: [], holidays: [])
        }
        return catalog
    }()

    func jobs(for mode: CatalogJob.Mode) -> [CatalogJob] { jobs.filter { $0.mode == mode } }
}

/// Price and time for a set of jobs, worked out the way the site's `estimate()` does.
struct PriceEstimate: Equatable {
    var from: Double
    var to: Double
    var etaHours: [Double]
    var needsDiagnosis: Bool
    var partsExtra: Bool

    init(jobs: [CatalogJob], hasCustom: Bool, value: DeviceValue?) {
        from = jobs.reduce(0) { $0 + $1.price(for: value).from }
        to = jobs.reduce(0) { $0 + $1.price(for: value).to }
        needsDiagnosis = hasCustom || jobs.contains { $0.needsDiagnosis }
        partsExtra = jobs.contains { $0.partsExtra }
        let shop = jobs.filter { $0.mode == .shop }
        let mobile = jobs.filter { $0.mode == .mobile }
        let shopMin = shop.map { $0.etaHours[0] }.max() ?? 0
        let shopMax = shop.map { $0.etaHours[1] }.max() ?? 0
        etaHours = [shopMin + mobile.reduce(0) { $0 + $1.etaHours[0] }, shopMax + mobile.reduce(0) { $0 + $1.etaHours[1] }]
    }
}
