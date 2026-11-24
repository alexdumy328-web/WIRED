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
    func testOnlyHTTPSServersAreAcceptedInRelease() {
        XCTAssertTrue(BackendSettingsView.isAllowed("https://norgelis.ro"))
        XCTAssertFalse(BackendSettingsView.isAllowed("ftp://norgelis.ro"))
        XCTAssertFalse(BackendSettingsView.isAllowed("norgelis.ro"))
        #if !DEBUG
        XCTAssertFalse(BackendSettingsView.isAllowed("http://192.168.1.2:8790"))
        #endif
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
    func testPickingASundayMovesToTheNextOpenDay() {
        let model = BookingModel(api: APIClient())
        model.pick(date: ShopCalendar.date("2026-12-06")) // Sunday
        XCTAssertEqual(model.day, "2026-12-07")
        XCTAssertTrue(model.dayMovedNote)
    }

    func testPickingAnOpenDayKeepsIt() {
        let model = BookingModel(api: APIClient())
        model.pick(date: ShopCalendar.date("2026-12-09")) // Wednesday
        XCTAssertEqual(model.day, "2026-12-09")
        XCTAssertFalse(model.dayMovedNote)
    }

    func testSubmitNeedsEverythingTheServerChecks() {
        let model = BookingModel(api: APIClient())
        XCTAssertFalse(model.canSubmit)
        model.jobIDs = [model.availableJobs[0].id]
        model.issue = "Does not start"
        model.name = "Ana"
        model.phone = "+40 700 000 000"
        XCTAssertFalse(model.canSubmit, "no slot yet")
        model.kind = .mobile
        XCTAssertFalse(model.whereOK, "on site needs an address")
    }
}
