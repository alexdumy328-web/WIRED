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

    /// The server's SUPPORT_EMAIL wins; the build setting is the fallback.
    @MainActor static var supportEmail: String? { RemoteConfig.shared.supportEmail ?? value("NorgelisSupportEmail") }
    static var phone: String? { value("NorgelisPhone") }
    /// The driver's own number when there is one, otherwise the shop's.
    static var driverPhone: String? { value("NorgelisDriverPhone") ?? phone }
    /// Both legal pages live on the website. Without a build setting they follow the server address.
    static var privacyURL: URL? { value("NorgelisPrivacyURL").flatMap(URL.init(string:)) ?? sitePage("confidentialitate") }
    static var termsURL: URL? { value("NorgelisTermsURL").flatMap(URL.init(string:)) ?? sitePage("termeni") }
    /// The feedback form (a Google Form link): the server's FEEDBACK_URL, else the build setting. Hidden when neither is set.
    @MainActor static var feedbackURL: URL? { RemoteConfig.shared.feedbackURL ?? value("NorgelisFeedbackURL").flatMap(URL.init(string:)) }

    private static func sitePage(_ path: String) -> URL? {
        URL(string: APIClient.shared.baseURLString)?.appendingPathComponent(path)
    }

    /// `tel:` link for a number written any way ("+40 (771) 332 210", "(0758) 561 001"). Never dials by itself.
    static func telURL(_ number: String) -> URL? {
        let digits = number.filter { $0.isNumber || $0 == "+" }
        return digits.isEmpty ? nil : URL(string: "tel:\(digits)")
    }

    /// WhatsApp wants the number with its country code and no plus, so a Romanian 07xx number gets 40.
    static func whatsappURL(_ number: String) -> URL? {
        var digits = number.filter { $0.isNumber || $0 == "+" }
        if digits.hasPrefix("+") { digits.removeFirst() } else if digits.hasPrefix("0") { digits = "40" + digits.dropFirst() }
        return digits.isEmpty ? nil : URL(string: "https://wa.me/\(digits)")
    }

    static func mailURL(to address: String, subject: String, body: String) -> URL? {
        var parts = URLComponents()
        parts.scheme = "mailto"
        parts.path = address
        parts.queryItems = [URLQueryItem(name: "subject", value: subject), URLQueryItem(name: "body", value: body)]
        return parts.url
    }
}
