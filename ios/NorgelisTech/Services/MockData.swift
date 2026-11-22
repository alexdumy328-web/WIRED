import Foundation
import CoreLocation

enum MockData {
    // Official shop coordinates in Iași
    static let shopCoordinate = CLLocationCoordinate2D(latitude: 47.166015, longitude: 27.558417)
    static let shopName = "Norgelis Tech (Atelier)"
    static let shopAddress = "Str. Atelierului 1, Iași"

    // Mock driver stops for today
    static let driverStops: [PickupStop] = [
        PickupStop(
            id: "stop-1",
            bookingCode: "NT-4K7Q",
            customerName: "Andrei Popescu",
            customerPhone: "+40 700 000 001",
            address: "Str. Palas 7A, Iași",
            coordinate: CLLocationCoordinate2D(latitude: 47.1585, longitude: 27.6014),
            type: .both,
            isUrgent: true,
            scheduledTime: "10:30",
            isCompleted: false
        ),
        PickupStop(
            id: "stop-2",
            bookingCode: "NT-8B2M",
            customerName: "Elena Ionescu",
            customerPhone: "+40 700 000 002",
            address: "Bulevardul Carol I nr. 14 (Copou), Iași",
            coordinate: CLLocationCoordinate2D(latitude: 47.1750, longitude: 27.5680),
            type: .pickup,
            isUrgent: false,
            scheduledTime: "11:45",
            isCompleted: false
        ),
        PickupStop(
            id: "stop-3",
            bookingCode: "NT-2P9X",
            customerName: "Mihai Dumitrescu",
            customerPhone: "+40 700 000 003",
            address: "Str. Sfântul Lazăr nr. 27, Iași",
            coordinate: CLLocationCoordinate2D(latitude: 47.1560, longitude: 27.5890),
            type: .dropoff,
            isUrgent: false,
            scheduledTime: "13:15",
            isCompleted: false
        ),
        PickupStop(
            id: "stop-4",
            bookingCode: "NT-6R3W",
            customerName: "Ioana Radu",
            customerPhone: "+40 700 000 004",
            address: "Șoseaua Păcurari nr. 82, Iași",
            coordinate: CLLocationCoordinate2D(latitude: 47.1710, longitude: 27.5510),
            type: .pickup,
            isUrgent: true,
            scheduledTime: "14:30",
            isCompleted: false
        )
    ]

    // Mock bookings list for owner and customer
    static let bookings: [Booking] = [
        Booking(
            code: "NT-4K7Q",
            status: .diagnosis,
            mode: "shop",
            jobIds: ["laptop-ssd-upgrade", "laptop-cleaning"],
            issue: "MacBook Air se încălzește excesiv și bateria ține sub o oră.",
            slot: "2026-11-21T10:30:00.000Z",
            device: DeviceDetails(brand: "Apple", model: "MacBook Air M1", year: "2021"),
            contact: ContactInfo(name: "Andrei Popescu", phone: "+40 700 000 001", email: "andrei@example.com"),
            pickup: PickupDetails(
                address: "Str. Palas 7A, Iași",
                lat: 47.1585,
                lon: 27.6014,
                trips: .both,
                urgent: true,
                quote: PickupQuote(totalLei: 70, oneWayKm: 4.8, urgentLei: 20)
            ),
            estimate: Estimate(priceFrom: 180, priceTo: 320, etaHours: [24, 48]),
            updatedAt: "2026-11-21T09:15:00.000Z"
        ),
        Booking(
            code: "NT-8B2M",
            status: .waitingParts,
            mode: "shop",
            jobIds: ["phone-screen"],
            issue: "Ecran spart în urma unei căzături pe asfalt.",
            slot: "2026-11-21T11:45:00.000Z",
            device: DeviceDetails(brand: "Samsung", model: "Galaxy S23", year: "2023"),
            contact: ContactInfo(name: "Elena Ionescu", phone: "+40 700 000 002", email: "elena@example.com"),
            pickup: PickupDetails(
                address: "Bulevardul Carol I nr. 14 (Copou), Iași",
                lat: 47.1750,
                lon: 27.5680,
                trips: .pickup,
                urgent: false,
                quote: PickupQuote(totalLei: 35, oneWayKm: 3.2, urgentLei: 0)
            ),
            estimate: Estimate(priceFrom: 450, priceTo: 650, etaHours: [48, 72]),
            updatedAt: "2026-11-21T08:30:00.000Z"
        ),
        Booking(
            code: "NT-2P9X",
            status: .ready,
            mode: "shop",
            jobIds: ["coffee-pump"],
            issue: "Espressorul nu mai trage apă și scoate zgomot ciudat.",
            slot: "2026-11-21T13:15:00.000Z",
            device: DeviceDetails(brand: "DeLonghi", model: "Magnifica S", year: "2022"),
            contact: ContactInfo(name: "Mihai Dumitrescu", phone: "+40 700 000 003", email: "mihai@example.com"),
            pickup: PickupDetails(
                address: "Str. Sfântul Lazăr nr. 27, Iași",
                lat: 47.1560,
                lon: 27.5890,
                trips: .dropoff,
                urgent: false,
                quote: PickupQuote(totalLei: 35, oneWayKm: 4.1, urgentLei: 0)
            ),
            estimate: Estimate(priceFrom: 0, priceTo: 0, etaHours: nil),
            updatedAt: "2026-11-21T09:45:00.000Z"
        ),
        Booking(
            code: "NT-6R3W",
            status: .received,
            mode: "shop",
            jobIds: ["laptop-battery"],
            issue: "Laptopul se închide brusc când este deconectat de la încărcător.",
            slot: "2026-11-21T14:30:00.000Z",
            device: DeviceDetails(brand: "Lenovo", model: "ThinkPad T14", year: "2021"),
            contact: ContactInfo(name: "Ioana Radu", phone: "+40 700 000 004", email: "ioana@example.com"),
            pickup: PickupDetails(
                address: "Șoseaua Păcurari nr. 82, Iași",
                lat: 47.1710,
                lon: 27.5510,
                trips: .pickup,
                urgent: true,
                quote: PickupQuote(totalLei: 60, oneWayKm: 2.5, urgentLei: 20)
            ),
            estimate: Estimate(priceFrom: 220, priceTo: 280, etaHours: [24, 24]),
            updatedAt: "2026-11-21T10:00:00.000Z"
        )
    ]
}
