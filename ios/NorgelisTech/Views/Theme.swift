import SwiftUI
import UIKit

/// Colour system shared with the website (`site/src/index.css`).
///
/// Gold, green and blue mean the kind of job. Violet and rose belong to
/// statuses only, so a status dot never reads as a kind of job.
enum Theme {
    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }

    // Kind of job
    /// Workshop visit.
    static let shop = adaptive(light: 0x8F6A10, dark: 0xD9A93F)
    /// Pickup and delivery.
    static let pickup = adaptive(light: 0x1E6B4A, dark: 0x42B075)
    /// On site at the customer.
    static let mobile = adaptive(light: 0x2F5E9E, dark: 0x6A9AE0)

    // Status-only hues
    static let violet = adaptive(light: 0x6B4FB8, dark: 0xA48BE8)
    static let rose = adaptive(light: 0xB8456F, dark: 0xEF7FA8)

    // Semantic
    static let ok = pickup
    static let danger = adaptive(light: 0xB3372E, dark: 0xFF6B5E)
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

/// The three kinds of job the site tells apart.
enum JobKind {
    case shop, pickup, mobile

    var color: Color {
        switch self {
        case .shop: return Theme.shop
        case .pickup: return Theme.pickup
        case .mobile: return Theme.mobile
        }
    }

    var titleKey: String {
        switch self {
        case .shop: return "kind.shop"
        case .pickup: return "kind.pickup"
        case .mobile: return "kind.mobile"
        }
    }

    var iconName: String {
        switch self {
        case .shop: return "wrench.and.screwdriver.fill"
        case .pickup: return "car.fill"
        case .mobile: return "house.fill"
        }
    }
}

/// Status dot, drawn the way the site draws it.
struct StatusDot: View {
    let status: BookingStatus
    var size: CGFloat = 10

    var body: some View {
        switch status {
        case .received:
            Circle().fill(Color.secondary)
                .frame(width: size, height: size)
        case .diagnosis:
            Circle().strokeBorder(Theme.violet, lineWidth: 2)
                .frame(width: size, height: size)
        case .waitingParts:
            Circle().fill(Theme.rose)
                .frame(width: size, height: size)
        case .repairing:
            Circle().fill(Theme.violet)
                .frame(width: size, height: size)
        case .ready:
            Circle().fill(Theme.ok)
                .frame(width: size, height: size)
        case .done:
            Circle().fill(Color.primary.opacity(0.4))
                .frame(width: size, height: size)
        case .cancelled:
            Circle().strokeBorder(Color.secondary, lineWidth: 1)
                .frame(width: size, height: size)
        }
    }
}

/// Status dot plus its label.
struct StatusBadge: View {
    let status: BookingStatus

    var body: some View {
        HStack(spacing: 6) {
            StatusDot(status: status)
            Text(LocalizedStringKey(status.titleKey))
                .font(.caption.bold())
                .foregroundColor(.primary)
        }
    }
}

/// Small coloured chip naming the kind of job.
struct KindChip: View {
    let kind: JobKind

    var body: some View {
        Label(LocalizedStringKey(kind.titleKey), systemImage: kind.iconName)
            .font(.caption2.bold())
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(kind.color.opacity(0.14))
            .foregroundColor(kind.color)
            .clipShape(Capsule())
    }
}

/// Price line for a booking. A range when there is one, "After diagnosis" when the top of the range is 0.
struct PriceRow: View {
    let estimate: Estimate

    var body: some View {
        LabeledContent(LocalizedStringKey("booking.price.label")) {
            if estimate.hasPrice {
                Text("\(Int(estimate.priceFrom))–\(Int(estimate.priceTo)) lei")
            } else {
                Text(LocalizedStringKey("booking.price.after_diagnosis"))
            }
        }
    }
}
