import SwiftUI

enum BookingStatus: String, Codable, CaseIterable, Identifiable {
    case received = "received"
    case diagnosis = "diagnosis"
    case waitingParts = "waiting-parts"
    case repairing = "repairing"
    case ready = "ready"
    case done = "done"
    case cancelled = "cancelled"

    var id: String { rawValue }

    var titleKey: String {
        "status.\(rawValue)"
    }

    var color: Color {
        switch self {
        case .received: return .blue
        case .diagnosis: return .purple
        case .waitingParts: return .orange
        case .repairing: return .indigo
        case .ready: return .green
        case .done: return .gray
        case .cancelled: return .red
        }
    }

    var iconName: String {
        switch self {
        case .received: return "tray.and.arrow.down.fill"
        case .diagnosis: return "magnifyingglass.circle.fill"
        case .waitingParts: return "shippingbox.fill"
        case .repairing: return "wrench.and.screwdriver.fill"
        case .ready: return "checkmark.seal.fill"
        case .done: return "checkmark.circle.fill"
        case .cancelled: return "xmark.circle.fill"
        }
    }
}
