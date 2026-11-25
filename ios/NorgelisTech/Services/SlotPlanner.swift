import Foundation

/// Opening days and booking windows, the same rules as the site's `lib/slots.ts`:
/// shop visits are 1-hour slots (Mon-Fri 09:00-17:00, Sat 10:00-13:00), on-site visits are 2-hour windows
/// (09, 11, 13, 15 on weekdays and 10 on Saturdays). Sundays and public holidays are closed, and a slot
/// must start at least 2 hours from now.
struct SlotPlanner {
    struct Slot: Hashable, Identifiable {
        var start: Date
        var label: String
        var id: Date { start }
        /// What the API expects: UTC with milliseconds.
        var iso: String { SlotPlanner.isoFormatter.string(from: start) }
    }

    var holidays: Set<String>
    var now: () -> Date = { Date() }

    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = ShopCalendar.timeZone
        return c
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func day(_ string: String) -> Date? {
        let p = string.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return Self.calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))
    }

    func isOpen(_ dayString: String) -> Bool {
        guard let noon = day(dayString), !holidays.contains(dayString) else { return false }
        return Self.calendar.component(.weekday, from: noon) != 1
    }

    private func startHours(_ dayString: String, mobile: Bool) -> [Int] {
        guard let noon = day(dayString) else { return [] }
        let saturday = Self.calendar.component(.weekday, from: noon) == 7
        if mobile { return saturday ? [10] : [9, 11, 13, 15] }
        return saturday ? [10, 11, 12, 13] : Array(9...17)
    }

    /// The next `count` open days, starting today while a slot is still possible.
    func daysAhead(count: Int, mobile: Bool, urgent: Bool = false) -> [String] {
        var result: [String] = []
        var offset = 0
        while result.count < count, offset < 90 {
            let date = Self.calendar.date(byAdding: .day, value: offset, to: now()) ?? now()
            let string = ShopCalendar.dateString(date)
            if isOpen(string), !slots(on: string, mobile: mobile, urgent: urgent, taken: []).isEmpty { result.append(string) }
            offset += 1
        }
        return result
    }

    func slots(on dayString: String, mobile: Bool, urgent: Bool = false, taken: Set<String>) -> [Slot] {
        guard isOpen(dayString) else { return [] }
        let p = dayString.split(separator: "-").compactMap { Int($0) }
        // An urgent pickup may take a window from one hour ahead instead of two, as the server allows.
        let lead: TimeInterval = urgent ? 3600 : 7200
        return startHours(dayString, mobile: mobile).compactMap { hour in
            guard let start = Self.calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour)) else { return nil }
            guard start.timeIntervalSince(now()) >= lead else { return nil }
            let slot = Slot(start: start, label: String(format: "%02d:00", hour))
            return taken.contains(slot.iso) ? nil : slot
        }
    }
}
