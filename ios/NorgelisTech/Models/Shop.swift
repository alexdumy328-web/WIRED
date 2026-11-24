import Foundation
import CoreLocation

/// The workshop: where it is and how to reach it. Contact details come from the build (Info.plist),
/// so nothing here is a made-up number or address. Empty values hide the matching row.
enum Shop {
    static let name = "Norgelis Tech"
    static let address = "Bd. Alexandru cel Bun 49, bl. Y1, parter, Iași"
    static let coordinate = CLLocationCoordinate2D(latitude: 47.166015, longitude: 27.558417)

    private static func value(_ key: String) -> String? {
        let raw = (Bundle.main.object(forInfoDictionaryKey: key) as? String)?.trimmingCharacters(in: .whitespaces)
        // An unset build setting reaches the plist as its own placeholder text.
        guard let raw, !raw.isEmpty, !raw.hasPrefix("$(") else { return nil }
        return raw
    }

    static var supportEmail: String? { value("NorgelisSupportEmail") }
    static var phone: String? { value("NorgelisPhone") }
    /// The driver's own number when there is one, otherwise the shop's.
    static var driverPhone: String? { value("NorgelisDriverPhone") ?? phone }
    static var privacyURL: URL? { value("NorgelisPrivacyURL").flatMap(URL.init(string:)) }
    static var termsURL: URL? { value("NorgelisTermsURL").flatMap(URL.init(string:)) }
}
