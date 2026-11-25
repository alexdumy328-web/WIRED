import ActivityKit
import SwiftUI
import WidgetKit

private let pickupGreen = Color(red: 0.13, green: 0.62, blue: 0.40)
private let gold = Color(red: 0.85, green: 0.66, blue: 0.25)
private let amber = Color(red: 0.96, green: 0.62, blue: 0.15)

/// Lock screen, banner and Dynamic Island for the driver heading to a booking.
///
/// The time left is the hero, in whole minutes (a van in traffic does not arrive to the second), with the arrival
/// clock time next to it. The server or the open app sends a new state at least every 30 seconds; between them the
/// progress track moves by itself (a timer progress view).
struct DriverLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DriverActivityAttributes.self) { context in
            LockScreenView(attributes: context.attributes, state: context.state, stale: context.isStale)
                .activityBackgroundTint(Color(red: 0.07, green: 0.08, blue: 0.09).opacity(0.95))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(DriverActivityAttributes.link(for: context.attributes.code))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    AppLogo(size: 42).padding(.leading, 4).padding(.top, 2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    EtaBlock(state: context.state, stale: context.isStale, size: 26).padding(.trailing, 4)
                }
                // The centre sits under the camera: left empty, everything else gets the full width below.
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        StatusRow(attributes: context.attributes, state: context.state, stale: context.isStale, showCode: true)
                        if !context.state.isOver { Track(attributes: context.attributes, state: context.state) }
                    }
                    .padding(.horizontal, 6)
                }
            } compactLeading: {
                AppLogo(size: 22)
            } compactTrailing: {
                CompactEta(state: context.state, stale: context.isStale)
            } minimal: {
                CompactEta(state: context.state, stale: context.isStale, minimal: true)
            }
            .widgetURL(DriverActivityAttributes.link(for: context.attributes.code))
            .keylineTint(gold)
        }
    }
}

// MARK: - Words

private func headline(_ state: DriverActivityAttributes.ContentState) -> LocalizedStringKey {
    switch state.phase {
    case .onTheWay: return "activity.on_the_way"
    case .arriving: return "activity.arriving"
    case .arrived: return "activity.arrived"
    case .ended: return "activity.ended"
    }
}

/// The driver's first name, unless the server only had its generic fallback ("Șofer").
private func driverName(_ state: DriverActivityAttributes.ContentState) -> String? {
    let name = state.driverName.trimmingCharacters(in: .whitespaces)
    let generic = ["", "șofer", "sofer", "driver"]
    return generic.contains(name.lowercased()) ? nil : name
}

/// Whole minutes left, rounded up, or nil once the van is there (or no ETA is known).
private func minutesLeft(_ state: DriverActivityAttributes.ContentState) -> Int? {
    guard state.phase == .onTheWay, let arrival = state.arrival else { return nil }
    let minutes = Int((arrival.timeIntervalSinceNow / 60).rounded(.up))
    return minutes >= 1 ? minutes : nil
}

private func isNow(_ state: DriverActivityAttributes.ContentState) -> Bool {
    state.phase == .arriving || (state.phase == .onTheWay && state.etaMinutes != nil && minutesLeft(state) == nil)
}

// MARK: - Pieces

/// The shop's logo, outlined so the dark squircle reads on the black island.
private struct AppLogo: View {
    let size: CGFloat
    var body: some View {
        Image("Logo")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous).stroke(Color.white.opacity(0.16), lineWidth: size > 30 ? 1 : 0.5))
            .accessibilityLabel(Text(verbatim: "Norgelis Tech"))
    }
}

/// "8 min" (gold) over "~12:36", or "Now", or a check mark.
private struct EtaBlock: View {
    let state: DriverActivityAttributes.ContentState
    let stale: Bool
    let size: CGFloat

    var body: some View {
        VStack(alignment: .trailing, spacing: 1) {
            if state.isOver {
                Image(systemName: "checkmark.circle.fill").font(.system(size: size, weight: .bold)).foregroundStyle(pickupGreen)
                    .accessibilityLabel(Text(headline(state)))
            } else if let minutes = minutesLeft(state) {
                Text("activity.minutes \(minutes)")
                    .font(.system(size: size, weight: .bold, design: .rounded))
                    .foregroundStyle(stale ? gold.opacity(0.55) : gold)
                    .monospacedDigit()
                    .contentTransition(.numericText(countsDown: true))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let arrival = state.arrival {
                    Text("activity.around \(Text(arrival, style: .time))").font(.caption).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
                }
            } else if isNow(state) {
                Text("activity.now").font(.system(size: size, weight: .bold, design: .rounded)).foregroundStyle(gold).lineLimit(1).minimumScaleFactor(0.6)
            } else {
                // Set off, ETA not known yet.
                Image(systemName: "box.truck.fill").font(.system(size: size * 0.8, weight: .bold)).foregroundStyle(pickupGreen)
                    .accessibilityLabel(Text("activity.calculating"))
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The island's small side: "8m", "Now" as an icon, or a check mark. Always readable at a glance.
private struct CompactEta: View {
    let state: DriverActivityAttributes.ContentState
    let stale: Bool
    var minimal = false

    var body: some View {
        Group {
            if state.isOver {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(pickupGreen)
            } else if let minutes = minutesLeft(state) {
                Text(minimal ? "activity.minutes_short \(minutes)" : "activity.minutes \(minutes)")
                    .foregroundStyle(stale ? gold.opacity(0.55) : gold)
                    .monospacedDigit()
                    .contentTransition(.numericText(countsDown: true))
            } else if isNow(state) {
                Image(systemName: "house.fill").foregroundStyle(gold)
            } else {
                Image(systemName: "box.truck.fill").foregroundStyle(pickupGreen)
            }
        }
        .font(.caption.bold())
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(headline(state)))
    }
}

/// "Driver on the way · Ion" with the booking code on the right, or the stale warning.
private struct StatusRow: View {
    let attributes: DriverActivityAttributes
    let state: DriverActivityAttributes.ContentState
    let stale: Bool
    let showCode: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(headline(state)).font(.subheadline.bold()).foregroundStyle(.white)
                    if let name = driverName(state), !state.isOver {
                        Text(verbatim: "· \(name)").font(.subheadline).foregroundStyle(.white.opacity(0.8))
                    }
                }
                .lineLimit(1)
                subtitle.font(.caption).foregroundStyle(stale && !state.isOver ? amber : .white.opacity(0.75)).lineLimit(1)
            }
            Spacer(minLength: 4)
            if showCode {
                Text(verbatim: attributes.code).font(.caption.monospaced()).foregroundStyle(.white.opacity(0.68))
            }
        }
    }

    @ViewBuilder private var subtitle: some View {
        switch state.phase {
        case .arrived:
            if let name = driverName(state) { Text("activity.waiting_named \(name)") } else { Text("activity.waiting") }
        case .ended:
            Text("activity.thanks")
        default:
            if stale {
                Label("activity.stale", systemImage: "exclamationmark.circle.fill")
            } else if state.etaMinutes == nil {
                Text("activity.calculating")
            } else if !attributes.device.isEmpty {
                Text(verbatim: attributes.device)
            } else {
                Text(verbatim: "Norgelis Tech")
            }
        }
    }
}

/// The van moving along a road toward the house, from the moment it set off to the expected arrival.
private struct Track: View {
    let attributes: DriverActivityAttributes
    let state: DriverActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "box.truck.fill").font(.caption).foregroundStyle(pickupGreen)
            Group {
                if let arrival = state.arrival, minutesLeft(state) != nil, let startedAt = attributes.startedAt {
                    let start = Date(timeIntervalSince1970: startedAt)
                    ProgressView(timerInterval: min(start, Date())...arrival, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                } else {
                    // Nearly there, just set off, or no start time from an older server: a fixed position, never a reset.
                    ProgressView(value: isNow(state) ? 0.95 : (state.etaMinutes == nil ? 0.1 : 0.5))
                }
            }
            .progressViewStyle(.linear)
            .tint(pickupGreen)
            .background(Color.white.opacity(0.15), in: Capsule())
            Image(systemName: "house.fill").font(.caption).foregroundStyle(gold)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(headline(state)))
    }
}

private struct LockScreenView: View {
    let attributes: DriverActivityAttributes
    let state: DriverActivityAttributes.ContentState
    let stale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                AppLogo(size: 44)
                StatusRow(attributes: attributes, state: state, stale: stale, showCode: false)
                EtaBlock(state: state, stale: stale, size: 32)
            }
            if !state.isOver { Track(attributes: attributes, state: state) }
            Text(verbatim: "Norgelis Tech · \(attributes.code)")
                .font(.caption.monospaced())
                .foregroundStyle(.white.opacity(0.68))
                .lineLimit(1)
        }
        .padding(16)
    }
}

#Preview("Lock screen", as: .content, using: DriverActivityAttributes(code: "NT-4K7Q", device: "Apple iPhone 13", startedAt: Date().addingTimeInterval(-300).timeIntervalSince1970)) {
    DriverLiveActivity()
} contentStates: {
    DriverActivityAttributes.ContentState(driverName: "Ion", etaMinutes: 9, phase: .onTheWay, updatedAt: Date().timeIntervalSince1970)
    DriverActivityAttributes.ContentState(driverName: "Ion", etaMinutes: 1, phase: .arriving, updatedAt: Date().timeIntervalSince1970)
    DriverActivityAttributes.ContentState(driverName: "Ion", etaMinutes: nil, phase: .arrived, updatedAt: 0)
}
