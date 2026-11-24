import XCTest
import CoreLocation
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

    func testADriverIsNotAManager() {
        XCTAssertFalse(StaffRole.driver.isManager)
        XCTAssertTrue(StaffRole.driver.isDriver)
        XCTAssertTrue(Viewer(id: "1", email: "d@x.ro", name: "D", emailVerified: true, role: "driver").isStaff)
        XCTAssertEqual(Viewer(id: "1", email: "d@x.ro", name: "D", emailVerified: true, role: "driver").staffRole, .driver)
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

    func testADriverJobDecodesWithoutWorkshopFields() throws {
        // What GET /api/driver/jobs sends: no intake, repair, notes, money or ids.
        let json = """
        {"total":1,"items":[{"code":"NT-ZFG8","status":"ready","mode":"shop","slot":"2026-11-25T07:00:00.000Z",
         "device":{"brand":"Lenovo","model":"T14"},"issue":"Does not charge","contact":{"name":"Ana","phone":"+40 700 000 111"},
         "pickup":{"address":"Str. Palas 7A","lat":47.1585,"lon":27.6014,"trips":"both"},"createdAt":"2026-11-24T10:00:00.000Z"}]}
        """.data(using: .utf8)!
        let page = try JSONDecoder().decode(Page<Booking>.self, from: json)
        XCTAssertEqual(page.items.first?.pickup?.address, "Str. Palas 7A")
        XCTAssertNil(page.items.first?.finalLei)
        XCTAssertNil(page.items.first?.intake)
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

/// Answers every request from a closure, so a test can see what the app sent without a network.
final class StubProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var seen: [URLRequest] = []

    static func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var req = request
        if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var data = Data(); var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: 1024); if n <= 0 { break }; data.append(buffer, count: n) }
            req.httpBody = data
        }
        Self.seen.append(req)
        let (status, body) = Self.handler?(req) ?? (204, Data())
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor
final class TrackingTests: XCTestCase {
    override func setUp() { StubProtocol.seen = []; StubProtocol.handler = nil }

    func testServerAnswersDecode() throws {
        let on = try JSONDecoder().decode(DriverTrackingStatus.self, from: Data("""
        {"isEnRoute":true,"driverName":"Ion","latitude":47.16,"longitude":27.58,"heading":90,"etaMinutes":7,"updatedAt":"2026-12-07T08:00:00.000Z"}
        """.utf8))
        XCTAssertTrue(on.isEnRoute)
        XCTAssertEqual(on.etaMinutes, 7)
        let off = try JSONDecoder().decode(DriverTrackingStatus.self, from: Data(#"{"isEnRoute":false}"#.utf8))
        XCTAssertFalse(off.isEnRoute)
        XCTAssertNil(off.latitude)
        let live = try JSONDecoder().decode([String: [LiveDriver]].self, from: Data("""
        {"drivers":[{"name":"Ion","latitude":47.16,"longitude":27.58,"heading":null,"speedKmh":30,"bookingCode":"NT-4K7Q","etaMinutes":null,"updatedAt":"2026-12-07T08:00:00.000Z"}]}
        """.utf8))
        XCTAssertEqual(live["drivers"]?.first?.bookingCode, "NT-4K7Q")
    }

    func testDemoFlagComesFromTheServer() throws {
        let demo = try JSONDecoder().decode(Viewer.self, from: Data(#"{"id":"1","email":"demo@x.ro","name":"Demo","emailVerified":true,"role":"customer","demo":true}"#.utf8))
        XCTAssertTrue(demo.isDemo)
        XCTAssertFalse(demo.isStaff, "a demo account holds no staff role")
        let plain = try JSONDecoder().decode(Viewer.self, from: Data(#"{"id":"1","email":"a@x.ro","name":"A","emailVerified":true,"role":"customer"}"#.utf8))
        XCTAssertFalse(plain.isDemo)
    }

    func testOnlyTheServerCanTurnSampleDataOn() {
        let api = APIClient(session: StubProtocol.session())
        XCTAssertFalse(api.useMockData)
        api.setDemo(true)
        XCTAssertTrue(api.useMockData)
        api.setDemo(false)
        XCTAssertFalse(api.useMockData)
    }

    func testSharingIsThrottledAndStopDeletes() async throws {
        let api = APIClient(session: StubProtocol.session())
        let sharing = DriverSharing(api: api)
        let here = CLLocation(latitude: 47.16, longitude: 27.58)
        sharing.offer(here, bookingCode: "NT-4K7Q", etaMinutes: 8)
        sharing.offer(CLLocation(latitude: 47.1601, longitude: 27.5801), bookingCode: "NT-4K7Q", etaMinutes: 8)
        sharing.offer(CLLocation(latitude: 47.1602, longitude: 27.5802), bookingCode: "NT-4K7Q", etaMinutes: 8)
        try await Task.sleep(nanoseconds: 300_000_000)
        let posts = StubProtocol.seen.filter { $0.httpMethod == "POST" && $0.url?.path == "/api/driver/location" }
        XCTAssertEqual(posts.count, 1, "three fixes in a second send one request")
        let body = try XCTUnwrap(posts.first?.httpBody.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })
        XCTAssertEqual(body["bookingCode"] as? String, "NT-4K7Q")
        XCTAssertEqual(body["etaMinutes"] as? Int, 8)
        XCTAssertNil(body["heading"], "no heading is sent when the phone has none")

        sharing.stop()
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertTrue(StubProtocol.seen.contains { $0.httpMethod == "DELETE" && $0.url?.path == "/api/driver/location" })

        let before = StubProtocol.seen.count
        sharing.stop()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(StubProtocol.seen.count, before, "stopping twice asks the server once")
    }

    func testAMalformedCodeNeverReachesTheServer() async throws {
        let api = APIClient(session: StubProtocol.session())
        let status = try await api.fetchDriver(code: "../admin")
        XCTAssertFalse(status.isEnRoute)
        XCTAssertTrue(StubProtocol.seen.isEmpty)
    }

    func testAServerHiccupKeepsTheSignedInPerson() async throws {
        // Someone is signed in, then the server answers 503 during a deploy: they stay signed in.
        StubProtocol.handler = { req in
            req.url?.path == "/api/me" ? (200, Data(#"{"user":{"id":"1","email":"a@x.ro","name":"A","emailVerified":true,"role":"customer"},"providers":{"google":false}}"#.utf8)) : (503, Data())
        }
        let api = APIClient(session: StubProtocol.session())
        let auth = AuthStore(api: api)
        await auth.refresh()
        XCTAssertEqual(auth.viewer?.id, "1")
        StubProtocol.handler = { _ in (503, Data()) }
        await auth.refresh()
        XCTAssertEqual(auth.viewer?.id, "1", "a 503 does not sign anybody out")
        StubProtocol.handler = { _ in (401, Data()) }
        await auth.refresh()
        XCTAssertNil(auth.viewer, "a 401 does")
    }
}
