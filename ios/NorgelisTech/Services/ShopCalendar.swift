import Foundation

/// Dates the way the site keeps them: "YYYY-MM-DD" in the shop's time zone (Europe/Bucharest).
enum ShopCalendar {
    static let timeZone = TimeZone(identifier: "Europe/Bucharest") ?? .current

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        c.firstWeekday = 2 // Monday
        return c
    }

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = format
        return f
    }

    /// Today (or any moment) as YYYY-MM-DD in shop time.
    static func dateString(_ date: Date = Date()) -> String {
        formatter("yyyy-MM-dd").string(from: date)
    }

    /// Noon of a YYYY-MM-DD day, so day maths never lands on a time zone edge.
    static func date(_ day: String) -> Date {
        formatter("yyyy-MM-dd HH:mm").date(from: day + " 12:00") ?? Date()
    }

    static func addDays(_ day: String, _ days: Int) -> String {
        dateString(calendar.date(byAdding: .day, value: days, to: date(day)) ?? date(day))
    }

    static func addMonths(_ day: String, _ months: Int) -> String {
        dateString(calendar.date(byAdding: .month, value: months, to: date(day)) ?? date(day))
    }

    static func mondayOf(_ day: String) -> String {
        let weekday = calendar.component(.weekday, from: date(day)) // 1 = Sunday
        let back = (weekday + 5) % 7
        return addDays(day, -back)
    }

    // MARK: - ISO timestamps from the API

    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func parse(_ iso: String) -> Date? {
        withFraction.date(from: iso) ?? plain.date(from: iso)
    }

    static func iso(_ date: Date) -> String {
        withFraction.string(from: date)
    }

    /// The shop-local day of an ISO timestamp.
    static func day(of iso: String) -> String {
        parse(iso).map { dateString($0) } ?? String(iso.prefix(10))
    }

    /// "10:30"
    static func time(_ iso: String) -> String {
        guard let d = parse(iso) else { return "" }
        return formatter("HH:mm").string(from: d)
    }

    /// ISO timestamp for a shop-local day and clock time.
    static func isoFor(day: String, hour: Int, minute: Int = 0) -> String {
        let text = String(format: "%@ %02d:%02d", day, hour, minute)
        return formatter("yyyy-MM-dd HH:mm").date(from: text).map(iso) ?? day
    }

    // MARK: - Display

    private static func display(_ date: Date, _ template: String) -> String {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = timeZone
        f.locale = Locale.current
        f.setLocalizedDateFormatFromTemplate(template)
        return f.string(from: date)
    }

    /// "Mon, 23 Nov"
    static func short(_ day: String) -> String { display(date(day), "EEEdMMM") }
    /// "23 Nov 2026"
    static func medium(_ day: String) -> String { display(date(day), "dMMMy") }
    /// "Nov"
    static func month(_ day: String) -> String { display(date(day), "MMM") }
    /// "23 Nov, 10:30"
    static func dateTime(_ iso: String) -> String {
        guard let d = parse(iso) else { return iso }
        return display(d, "dMMMHHmm")
    }
    /// "Mon"
    static func weekday(_ day: String) -> String { display(date(day), "EEE") }
    /// "23"
    static func dayNumber(_ day: String) -> String { display(date(day), "d") }
}
