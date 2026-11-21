import Foundation

enum UserRole: String, CaseIterable, Identifiable {
    case driver = "driver"
    case owner = "owner"
    case customer = "customer"

    var id: String { rawValue }

    var titleKey: String {
        switch self {
        case .driver: return "role.driver"
        case .owner: return "role.owner"
        case .customer: return "role.customer"
        }
    }

    var iconName: String {
        switch self {
        case .driver: return "car.fill"
        case .owner: return "building.2.fill"
        case .customer: return "person.fill"
        }
    }
}
