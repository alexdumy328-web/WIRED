import SwiftUI

enum BookingStatus: String, Codable, CaseIterable, Identifiable {
    case received = "received"
    case diagnosis = "diagnosis"
    case waitingParts = "waiting-parts"
    case repairing = "repairing"
    case ready = "ready"
    case unrepairable = "unrepairable"
    case done = "done"
    case cancelled = "cancelled"

    var id: String { rawValue }

    var titleKey: String {
        "status.\(rawValue)"
    }

    /// Tint for text and icons. Never gold, green-as-kind or blue: those mean the kind of job.
    var color: Color {
        switch self {
        case .received: return .secondary
        case .diagnosis: return Theme.violet
        case .waitingParts: return Theme.rose
        case .repairing: return Theme.violet
        case .ready: return Theme.ok
        case .unrepairable: return Theme.rose
        case .done: return Color.primary.opacity(0.4)
        case .cancelled: return .secondary
        }
    }

    var iconName: String {
        switch self {
        case .received: return "tray.and.arrow.down.fill"
        case .diagnosis: return "magnifyingglass.circle.fill"
        case .waitingParts: return "shippingbox.fill"
        case .repairing: return "wrench.and.screwdriver.fill"
        case .ready: return "checkmark.seal.fill"
        case .unrepairable: return "exclamationmark.octagon.fill"
        case .done: return "checkmark.circle.fill"
        case .cancelled: return "xmark.circle.fill"
        }
    }
}
