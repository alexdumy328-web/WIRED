import SwiftUI

// Small pieces shared by the owner console screens.

/// What a screen is doing with its data.
enum LoadState<Value> {
    case loading
    case loaded(Value)
    case failed(String)

    var value: Value? {
        if case .loaded(let v) = self { return v }
        return nil
    }
}

/// A localized key built at run time. Interpolating inside `LocalizedStringKey("…\(x)")` looks up the wrong key.
func loc(_ key: String) -> LocalizedStringKey { LocalizedStringKey(key) }

enum Money {
    private static let formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f
    }()

    /// "1.250 lei"
    static func lei(_ value: Double) -> String {
        "\(formatter.string(from: NSNumber(value: value.rounded())) ?? "0") lei"
    }

    static func lei(_ value: Int) -> String { lei(Double(value)) }

    /// "180–320 lei", or "After diagnosis" when the top of the range is 0.
    static func estimate(_ e: Estimate) -> String {
        e.hasPrice ? "\(formatter.string(from: NSNumber(value: e.priceFrom)) ?? "0")–\(lei(e.priceTo))" : String(localized: "booking.price.after_diagnosis")
    }
}

struct ErrorBanner: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 10) {
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline)
                .foregroundColor(Theme.danger)
                .multilineTextAlignment(.center)
            if let retry {
                Button(LocalizedStringKey("common.retry"), action: retry)
                    .buttonStyle(.bordered)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
    }
}

/// Title row for a section of cards.
struct SectionTitle: View {
    let key: LocalizedStringKey
    var trailing: LocalizedStringKey?
    var action: (() -> Void)?

    init(_ key: LocalizedStringKey, trailing: LocalizedStringKey? = nil, action: (() -> Void)? = nil) {
        self.key = key
        self.trailing = trailing
        self.action = action
    }

    var body: some View {
        HStack {
            Text(key).font(.headline)
            Spacer()
            if let trailing, let action {
                Button(action: action) {
                    Text(trailing).font(.subheadline)
                }
            }
        }
    }
}

struct KpiCard: View {
    let icon: String
    let tint: Color
    let title: LocalizedStringKey
    let value: String
    var action: (() -> Void)?

    var body: some View {
        Button {
            action?()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(tint)
                    .frame(width: 40, height: 40)
                    .background(tint.opacity(0.14))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.caption).foregroundColor(.secondary)
                    Text(value).font(.title2.bold()).monospacedDigit().foregroundColor(.primary)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }
}

/// "Andrei Popescu · Apple MacBook Air M1"
struct JobRow: View {
    let booking: Booking

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(booking.code).font(.subheadline.bold()).monospaced()
                KindChip(kind: booking.kind)
                if booking.isWalkIn {
                    Image(systemName: "figure.walk")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 4)
                StatusBadge(status: booking.status)
            }
            Text(booking.device?.displayName ?? String(localized: "console.job.no_device"))
                .font(.headline)
                .lineLimit(1)
            HStack(spacing: 6) {
                Text(booking.contact?.name ?? "")
                if let sheet = booking.intake?.label {
                    Text("·")
                    Label(sheet, systemImage: "doc.text")
                        .labelStyle(.titleAndIcon)
                        .lineLimit(1)
                }
                Spacer()
                if let slot = booking.slot {
                    Text(ShopCalendar.dateTime(slot))
                }
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

/// Label above a value inside a Form-like card.
struct InfoRow: View {
    let title: LocalizedStringKey
    let value: String

    var body: some View {
        LabeledContent(title) {
            Text(value).multilineTextAlignment(.trailing)
        }
    }
}

func call(_ phone: String) {
    let digits = phone.filter { "+0123456789".contains($0) }
    if let url = URL(string: "tel://\(digits)") { UIApplication.shared.open(url) }
}

func mail(_ email: String) {
    if let url = URL(string: "mailto:\(email)") { UIApplication.shared.open(url) }
}

func whatsapp(_ phone: String) {
    let digits = phone.filter { "0123456789".contains($0) }
    let intl = digits.hasPrefix("0") ? "4" + digits : digits
    if let url = URL(string: "https://wa.me/\(intl)") { UIApplication.shared.open(url) }
}

/// Phone, WhatsApp and email actions for a contact.
struct ContactButtons: View {
    var phone: String?
    var email: String?

    var body: some View {
        HStack(spacing: 10) {
            if let phone, !phone.isEmpty {
                Button { call(phone) } label: { Label("console.contact.call", systemImage: "phone.fill") }
                Button { whatsapp(phone) } label: { Label("WhatsApp", systemImage: "message.fill") }
            }
            if let email, !email.isEmpty {
                Button { mail(email) } label: { Label("Email", systemImage: "envelope.fill") }
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }
}
