import SwiftUI

/// Where a repair is, as steps on a line: booked, collected, diagnosis, repair, ready, handed back.
/// Done steps are filled, the current one is highlighted, the rest are hollow. Under each done step, when.
struct RepairProgress: View {
    let booking: Booking

    enum StepState { case done, current, todo, failed }

    struct Step: Identifiable {
        let id: String
        let title: LocalizedStringKey
        let icon: String
        var state: StepState
        var at: String?
    }

    var body: some View {
        if booking.status == .cancelled {
            Label("progress.cancelled", systemImage: "xmark.circle.fill")
                .font(.subheadline.bold())
                .foregroundColor(Theme.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(Theme.danger.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        } else {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(loc("progress.now.\(booking.status.rawValue)")).font(.headline)
                    Text(loc(explainKey))
                        .font(.subheadline).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                track
            }
            .padding(16)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - The line

    private var track: some View {
        let steps = self.steps
        return VStack(spacing: 8) {
            // Circles on a line; the line is filled up to the current step.
            GeometryReader { geo in
                let w = geo.size.width / CGFloat(steps.count)
                let center = { (i: Int) in w * (CGFloat(i) + 0.5) }
                let reached = steps.lastIndex { $0.state != .todo } ?? 0
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.primary.opacity(0.12))
                        .frame(width: center(steps.count - 1) - center(0), height: 4)
                        .offset(x: center(0))
                    Capsule().fill(tint)
                        .frame(width: max(0, center(reached) - center(0)), height: 4)
                        .offset(x: center(0))
                    ForEach(Array(steps.enumerated()), id: \.element.id) { i, step in
                        dot(step).position(x: center(i), y: geo.size.height / 2)
                    }
                }
            }
            .frame(height: 34)

            HStack(alignment: .top, spacing: 0) {
                ForEach(steps) { step in
                    VStack(spacing: 2) {
                        Text(step.title)
                            .font(.caption2.weight(step.state == .current ? .bold : .regular))
                            .foregroundColor(step.state == .todo ? .secondary : .primary)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.8)
                        if let at = step.at, step.state != .todo {
                            Text(ShopCalendar.dayMonth(ShopCalendar.day(of: at)))
                                .font(.system(size: 9)).foregroundColor(.secondary).lineLimit(1).minimumScaleFactor(0.7)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    /// The pickup and on-site visits read differently before anything happened, and once collected.
    private var explainKey: String {
        let s = booking.status.rawValue
        if booking.status == .received {
            if booking.kind == .pickup, booking.pickup?.trips != .dropoff {
                return booking.collectedAt != nil ? "progress.explain.received.collected" : "progress.explain.received.pickup"
            }
            if booking.kind == .mobile { return "progress.explain.received.mobile" }
        }
        return "progress.explain.\(s)"
    }

    private var tint: Color { booking.status == .unrepairable ? Theme.danger : Theme.ok }

    @ViewBuilder
    private func dot(_ step: Step) -> some View {
        switch step.state {
        case .done:
            Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)).foregroundColor(.white)
                .frame(width: 24, height: 24).background(Circle().fill(tint))
        case .current:
            Image(systemName: step.icon).font(.system(size: 13, weight: .bold)).foregroundColor(.white)
                .frame(width: 32, height: 32).background(Circle().fill(tint))
                .overlay(Circle().stroke(tint.opacity(0.35), lineWidth: 5).padding(-4))
        case .failed:
            Image(systemName: "xmark").font(.system(size: 13, weight: .heavy)).foregroundColor(.white)
                .frame(width: 32, height: 32).background(Circle().fill(Theme.danger))
        case .todo:
            Circle().strokeBorder(Color.primary.opacity(0.25), lineWidth: 2)
                .background(Circle().fill(Color(.secondarySystemBackground)))
                .frame(width: 22, height: 22)
        }
    }

    // MARK: - Which steps

    private func when(_ status: BookingStatus) -> String? {
        booking.timeline?.first { $0.status == status }?.at
    }

    var steps: [Step] {
        let s = booking.status
        let pickup = booking.kind == .pickup
        let needsCollect = pickup && booking.pickup?.trips != .dropoff
        let delivers = pickup && booking.pickup?.trips != .pickup
        let onSite = booking.kind == .mobile
        // Where the booking is on the line, in order.
        let order: [BookingStatus] = [.received, .diagnosis, .waitingParts, .repairing, .ready, .unrepairable, .done]
        let rank = order.firstIndex(of: s) ?? 0
        func state(reached: Bool, current: Bool) -> StepState { current ? .current : reached ? .done : .todo }

        var out: [Step] = []
        let collected = needsCollect && (booking.collectedAt != nil || rank >= 1)
        out.append(Step(id: "booked", title: "progress.step.booked", icon: "calendar",
                        state: state(reached: true, current: s == .received && !collected), at: when(.received) ?? booking.createdAt))
        if needsCollect {
            out.append(Step(id: "collected", title: "progress.step.collected", icon: "shippingbox.fill",
                            state: state(reached: collected, current: s == .received && collected), at: booking.collectedAt))
        }
        out.append(Step(id: "diagnosis", title: "progress.step.diagnosis", icon: "stethoscope",
                        state: state(reached: rank >= 1, current: s == .diagnosis), at: when(.diagnosis)))
        let waiting = s == .waitingParts
        out.append(Step(id: "repair", title: waiting ? "progress.step.waiting_parts" : "progress.step.repairing", icon: waiting ? "shippingbox" : "wrench.and.screwdriver.fill",
                        state: state(reached: rank >= 2, current: s == .waitingParts || s == .repairing), at: when(.waitingParts) ?? when(.repairing)))
        if !onSite {
            if s == .unrepairable {
                out.append(Step(id: "ready", title: "progress.step.unrepairable", icon: "xmark", state: .failed, at: when(.unrepairable)))
            } else {
                out.append(Step(id: "ready", title: "progress.step.ready", icon: "checkmark.seal.fill",
                                state: state(reached: rank >= 4, current: s == .ready), at: when(.ready)))
            }
        }
        out.append(Step(id: "done", title: delivers ? "progress.step.delivered" : onSite ? "progress.step.finished" : "progress.step.picked_up", icon: "hand.thumbsup.fill",
                        state: s == .done ? .done : .todo, at: booking.deliveredAt ?? when(.done)))
        return out
    }
}
