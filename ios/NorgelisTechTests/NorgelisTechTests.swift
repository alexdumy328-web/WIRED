import XCTest
@testable import NorgelisTech

final class CatalogTests: XCTestCase {
    func testPriceListShipsInTheApp() {
        let catalog = Catalog.shared
        XCTAssertGreaterThan(catalog.jobs.count, 30)
        XCTAssertFalse(catalog.holidays.isEmpty)
        XCTAssertFalse(catalog.jobs(for: .shop).isEmpty)
        XCTAssertFalse(catalog.jobs(for: .mobile).isEmpty)
    }

    func testEstimateAddsPricesAndTakesTheLongestShopTime() {
        let jobs = Catalog.shared.jobs(for: .shop).prefix(2).map { $0 }
        let estimate = PriceEstimate(jobs: jobs, hasCustom: false, value: nil)
        XCTAssertEqual(estimate.from, jobs.reduce(0) { $0 + $1.priceFrom })
        XCTAssertEqual(estimate.etaHours[1], jobs.map { $0.etaHours[1] }.max())
    }

    func testCustomJobNeedsDiagnosis() {
        XCTAssertTrue(PriceEstimate(jobs: [], hasCustom: true, value: nil).needsDiagnosis)
    }
}

final class SlotPlannerTests: XCTestCase {
    private func planner(now: String) -> SlotPlanner {
        let date = ISO8601DateFormatter().date(from: now)!
        return SlotPlanner(holidays: ["2026-12-01"], now: { date })
    }

    func testSundayAndHolidaysAreClosed() {
        let p = planner(now: "2026-11-20T08:00:00Z")
        XCTAssertFalse(p.isOpen("2026-11-22"), "Sunday")
        XCTAssertFalse(p.isOpen("2026-12-01"), "National Day")
        XCTAssertTrue(p.isOpen("2026-11-23"))
    }

    func testShopSlotsRunNineToFiveOnWeekdaysAndTenToOneOnSaturday() {
        let p = planner(now: "2026-11-20T08:00:00Z")
        XCTAssertEqual(p.slots(on: "2026-11-23", mobile: false, taken: []).map(\.label).first, "09:00")
        XCTAssertEqual(p.slots(on: "2026-11-23", mobile: false, taken: []).count, 9)
        XCTAssertEqual(p.slots(on: "2026-11-21", mobile: false, taken: []).map(\.label), ["10:00", "11:00", "12:00", "13:00"])
        XCTAssertEqual(p.slots(on: "2026-11-23", mobile: true, taken: []).map(\.label), ["09:00", "11:00", "13:00", "15:00"])
    }

    func testSlotsStartingInUnderTwoHoursAreHidden() {
        // 07:30 UTC is 09:30 in Bucharest (EET), so 09:00 and 10:00 and 11:00 are too soon.
        let p = planner(now: "2026-11-23T07:30:00Z")
        XCTAssertEqual(p.slots(on: "2026-11-23", mobile: false, taken: []).map(\.label).first, "12:00")
        XCTAssertEqual(p.slots(on: "2026-11-23", mobile: false, urgent: true, taken: []).map(\.label).first, "11:00")
    }

    func testTakenSlotsAreHidden() {
        let p = planner(now: "2026-11-20T08:00:00Z")
        let first = p.slots(on: "2026-11-23", mobile: false, taken: [])[0]
        XCTAssertEqual(first.iso, "2026-11-23T07:00:00.000Z")
        XCTAssertFalse(p.slots(on: "2026-11-23", mobile: false, taken: [first.iso]).contains(first))
    }
}

final class AuthMappingTests: XCTestCase {
    func testForbiddenIsNotAlwaysUnverified() {
        XCTAssertEqual(AuthStore.problem(status: 403, code: "EMAIL_NOT_VERIFIED"), .unverified)
        XCTAssertEqual(AuthStore.problem(status: 403, code: "INVALID_ORIGIN"), .other)
        XCTAssertEqual(AuthStore.problem(status: 403, code: "TOO_MANY_ATTEMPTS"), .tooMany)
    }

    func testMissingDeleteRouteIsReportedAsUnavailable() {
        XCTAssertEqual(AuthStore.problem(status: 404, code: nil), .unavailable)
    }

    func testWrongPassword() {
        XCTAssertEqual(AuthStore.problem(status: 401, code: "INVALID_EMAIL_OR_PASSWORD"), .invalidLogin)
    }
}

final class ConfigTests: XCTestCase {
    func testReleaseAcceptsOnlyHTTPSServers() {
        XCTAssertTrue(APIClient.isAllowedServer("https://norgelis.ro", allowHTTP: false))
        XCTAssertFalse(APIClient.isAllowedServer("http://192.168.1.2:8790", allowHTTP: false))
        XCTAssertTrue(APIClient.isAllowedServer("http://192.168.1.2:8790", allowHTTP: true), "Debug may use a local server")
        XCTAssertFalse(APIClient.isAllowedServer("ftp://norgelis.ro", allowHTTP: true))
        XCTAssertFalse(APIClient.isAllowedServer("norgelis.ro", allowHTTP: true))
    }

    func testPhoneLinksNeverNeedTheNumberTyped() {
        XCTAssertEqual(Shop.telURL("+40 (771) 332 210")?.absoluteString, "tel:+40771332210")
        XCTAssertEqual(Shop.telURL("(0758) 561 001")?.absoluteString, "tel:0758561001")
        XCTAssertEqual(Shop.whatsappURL("+40 (771) 332 210")?.absoluteString, "https://wa.me/40771332210")
        XCTAssertEqual(Shop.whatsappURL("(0758) 561 001")?.absoluteString, "https://wa.me/40758561001", "a national number gets the country code")
        XCTAssertNil(Shop.telURL("   "))
    }

    func testMailLinkEncodesTheBody() {
        let url = Shop.mailURL(to: "a@b.ro", subject: "Cont & date", body: "x+y@z.ro")
        XCTAssertTrue(url?.absoluteString.contains("subject=Cont%20%26%20date") == true)
        XCTAssertTrue(url?.absoluteString.contains("x%2By@z.ro") == true || url?.absoluteString.contains("x+y@z.ro") == true)
    }

    func testPhoneValidationMatchesTheServer() {
        XCTAssertTrue(BookingModel.validPhone("+40 700 000 000"))
        XCTAssertFalse(BookingModel.validPhone("12"))
        XCTAssertFalse(BookingModel.validPhone("abc123456789"))
    }

    func testRolesRoute() {
        XCTAssertTrue(Viewer(id: "1", email: "a@b.ro", name: "A", emailVerified: true, role: "technician").isStaff)
        XCTAssertFalse(Viewer(id: "1", email: "a@b.ro", name: "A", emailVerified: true, role: "customer").isStaff)
        XCTAssertFalse(StaffRole.technician.isManager)
        XCTAssertTrue(StaffRole.dev.isManager)
    }
}

@MainActor
final class BookingModelTests: XCTestCase {
    /// Monday 2026-12-07, 08:00 in Bucharest.
    private let clock = ISO8601DateFormatter().date(from: "2026-12-07T06:00:00Z")!

    private func model() -> BookingModel { BookingModel(api: APIClient(), now: { self.clock }) }

    private func filled(_ m: BookingModel) -> BookingModel {
        m.jobIDs = [m.availableJobs[0].id]
        m.issue = "Does not start"
        m.name = "Ana Pop"
        m.phone = "+40 700 000 000"
        m.slot = m.slots.first
        return m
    }

    func testPickingASundayMovesToTheNextOpenDay() {
        let m = model()
        m.pick(date: ShopCalendar.date("2026-12-13")) // Sunday
        XCTAssertEqual(m.day, "2026-12-14")
        XCTAssertTrue(m.dayMovedNote)
    }

    func testPickingAnOpenDayKeepsIt() {
        let m = model()
        m.pick(date: ShopCalendar.date("2026-12-09")) // Wednesday
        XCTAssertEqual(m.day, "2026-12-09")
        XCTAssertFalse(m.dayMovedNote)
    }

    func testTheCalendarNeverPassesTheSlotsWindow() {
        let range = model().dateRange
        XCTAssertLessThanOrEqual(range.upperBound.timeIntervalSince(ShopCalendar.date("2026-12-07")), 30 * 86_400 + 1)
    }

    func testEmailRuleIsCloseToTheServers() {
        let m = model()
        for good in ["ana@example.ro", "a.b+c@mail.example.com"] { m.email = good; XCTAssertTrue(m.emailOK, good) }
        for bad in ["ion.pop@gmail", "a b@x.ro", "@x.ro", "x@y.r"] { m.email = bad; XCTAssertFalse(m.emailOK, bad) }
    }

    func testNeedsEverythingTheServerChecks() {
        let m = model()
        XCTAssertFalse(m.canSubmit)
        _ = filled(m)
        XCTAssertTrue(m.canSubmit)
        m.kind = .mobile
        XCTAssertFalse(m.canSubmit, "on site needs an address, and a new kind resets the slot")
    }

    func testMoreThanTenJobsIsRefused() {
        let m = filled(model())
        m.jobIDs = Set(m.availableJobs.prefix(11).map(\.id))
        XCTAssertFalse(m.canSubmit)
        m.jobIDs = Set(m.availableJobs.prefix(10).map(\.id))
        XCTAssertTrue(m.canSubmit)
        XCTAssertFalse(m.canAddJob)
    }

    func testSlotTimesFollowDaylightSaving() {
        // Romania changes the clock on the last Sunday of March and October. 09:00 is 06:00 UTC in summer, 07:00 in winter.
        let summer = BookingModel(api: APIClient(), now: { ISO8601DateFormatter().date(from: "2026-10-20T00:00:00Z")! })
        XCTAssertEqual(summer.planner.slots(on: "2026-10-23", mobile: false, taken: []).first?.iso, "2026-10-23T06:00:00.000Z")
        let winter = BookingModel(api: APIClient(), now: { ISO8601DateFormatter().date(from: "2026-10-20T00:00:00Z")! })
        XCTAssertEqual(winter.planner.slots(on: "2026-10-26", mobile: false, taken: []).first?.iso, "2026-10-26T07:00:00.000Z")
    }

    func testBodyMatchesTheServerSchema() throws {
        let m = filled(model())
        m.brand = String(repeating: "x", count: 200)
        let body = try XCTUnwrap(m.requestBody())
        XCTAssertEqual(body["mode"] as? String, "shop")
        XCTAssertEqual(body["lang"] as? String == "en" || body["lang"] as? String == "ro", true)
        XCTAssertNil(body["pickup"], "a workshop visit has no pickup block")
        XCTAssertNil(body["location"])
        XCTAssertEqual((body["device"] as? [String: Any])?["brand"] as? String, String(repeating: "x", count: 60))
        // Now is 08:00 in Bucharest, so the first slot (2 hours ahead) is 10:00 = 08:00 UTC, with milliseconds like toISOString().
        XCTAssertEqual(body["slot"] as? String, "2026-12-07T08:00:00.000Z")
        XCTAssertNotNil(try? JSONSerialization.data(withJSONObject: body))

        m.kind = .pickup
        m.slot = m.slots.first
        XCTAssertNil(m.requestBody(), "a pickup needs an address and a quote")
        m.place = GeoPlace(label: String(repeating: "a", count: 300), lat: 47.16, lon: 27.58, city: "Iasi")
        m.quote = PickupQuoteInfo(totalLei: 60, oneWayKm: 4, urgentLei: nil, tooFar: false)
        let pickup = try XCTUnwrap(m.requestBody())
        XCTAssertEqual(pickup["mode"] as? String, "shop", "pickup is a shop visit with a pickup block")
        XCTAssertEqual((pickup["pickup"] as? [String: Any])?["address"] as? String, String(repeating: "a", count: 200))
    }
}

final class DecodingTests: XCTestCase {
    func testMyBookingsDecodeWithoutIntakeBy() throws {
        // What GET /api/me/bookings sends: customerView leaves out intake.by, statusHistory and userId.
        let json = """
        {"bookings":[{"code":"NT-4K7Q","status":"repairing","mode":"shop","jobIds":["laptop-dc-jack"],
         "slot":"2026-12-07T07:00:00.000Z","createdAt":"2026-12-01T10:00:00.000Z",
         "intake":{"number":12,"year":2026,"receivedAt":"2026-12-07T07:05:00.000Z","deviceType":"Laptop"},
         "timeline":[{"status":"received","at":"2026-12-01T10:00:00.000Z"}],
         "contact":{"name":"Ana","phone":"+40 700 000 000"}}]}
        """.data(using: .utf8)!
        struct Envelope: Decodable { var bookings: [Booking] }
        let bookings = try JSONDecoder().decode(Envelope.self, from: json).bookings
        XCTAssertEqual(bookings.count, 1)
        XCTAssertNil(bookings[0].intake?.by)
        XCTAssertEqual(bookings[0].intake?.label, "12/2026")
    }

    func testPickupsBecomeDriverStops() throws {
        let json = """
        {"date":"2026-12-07","jobs":[{"code":"NT-8B2M","status":"received","slot":"2026-12-07T09:30:00.000Z",
         "window":{"from":"2026-12-07T09:00:00.000Z","to":"2026-12-07T10:00:00.000Z"},"trips":"both","urgent":true,
         "address":"Str. Palas 7A, Iasi","lat":47.1585,"lon":27.6014,"name":"Ana","phone":"+40 700 000 000","device":"Laptop","quoteLei":60}]}
        """.data(using: .utf8)!
        let reply = try JSONDecoder().decode(PickupsResponse.self, from: json)
        let stop = PickupStop(job: reply.jobs[0])
        XCTAssertEqual(stop.bookingCode, "NT-8B2M")
        XCTAssertTrue(stop.isUrgent)
        XCTAssertEqual(stop.type, .both)
        XCTAssertFalse(stop.isCompleted)
    }
}

@MainActor
final class SessionResetTests: XCTestCase {
    func testSigningOutStopsTheTripAndForgetsWhatTheLastPersonSaw() {
        let state = AppState()
        state.stops = [PickupStop(id: "NT-1", bookingCode: "NT-1", customerName: "Ana", customerPhone: "+40 700 000 000", address: "Str. Palas 7A",
                                  coordinate: Shop.coordinate, type: .both, isUrgent: false, scheduledTime: "10:00")]
        state.startTripToStop(state.stops[0])
        state.customerSearchQuery = "NT-1"
        XCTAssertTrue(state.isDriverEnRoute)
        state.resetSession()
        XCTAssertFalse(state.isDriverEnRoute)
        XCTAssertNil(state.currentEnRouteStop)
        XCTAssertTrue(state.stops.isEmpty)
        XCTAssertEqual(state.customerSearchQuery, "")
        XCTAssertNil(state.currentCustomerBooking)
    }

    func testTheConsoleFallsBackToTheLeastAccess() {
        let store = OwnerStore(api: APIClient())
        store.role = .owner
        store.tab = .more
        store.jobsFilter = "ready"
        store.reset()
        XCTAssertEqual(store.role, .technician)
        XCTAssertEqual(store.tab, .today)
        XCTAssertNil(store.jobsFilter)
    }

    func testSampleDataIsNeverSaved() {
        let api = APIClient()
        api.useMockData = true
        XCTAssertFalse(APIClient().useMockData, "a new launch starts with sample data off")
        api.disableSample()
        XCTAssertFalse(api.useMockData)
    }
}
