import SwiftUI
import MapKit
import UIKit

// The driver's bottom panel: next stop, the day's stops, one stop's details, and the trip itself.

enum PanelDetent {
    case peek, mid, full
}

/// A floating bottom panel with three heights. Drag the top of it to change height.
///
/// The panel is laid out once at its full height and slides with `offset`, so a drag moves pixels instead of
/// laying the stop list (and the glass) out again on every frame. The part below the screen is given back to the
/// content as bottom padding, so the end of the list stays reachable at every height.
struct DriverPanel<Header: View, Content: View>: View {
    @Binding var detent: PanelDetent
    let header: Header
    let content: Content

    /// Live finger travel. Plain state, not @GestureState, so letting go animates it back in the same spring as the snap.
    @State private var drag: CGFloat = 0
    /// Height of the handle and header, measured, so large text sizes never push a button out of the peek.
    @State private var headerHeight: CGFloat = 170
    private var peekHeight: CGFloat { headerHeight }

    init(detent: Binding<PanelDetent>, @ViewBuilder header: () -> Header, @ViewBuilder content: () -> Content) {
        self._detent = detent
        self.header = header()
        self.content = content()
    }

    private func height(_ d: PanelDetent, _ total: CGFloat) -> CGFloat {
        switch d {
        case .peek: return peekHeight
        case .mid: return max(peekHeight + 120, total * 0.52)
        case .full: return max(peekHeight + 220, total * 0.86)
        }
    }

    /// Past the shortest or tallest height the panel follows the finger less and less (rubber band).
    private func rubberBand(_ value: CGFloat, min lo: CGFloat, max hi: CGFloat) -> CGFloat {
        if value < lo { return lo - (lo - value) / (1 + (lo - value) / 120) * 0.6 }
        if value > hi { return hi + (value - hi) / (1 + (value - hi) / 120) * 0.6 }
        return value
    }

    var body: some View {
        GeometryReader { geo in
            let total = geo.size.height
            let full = height(.full, total)
            let current = height(detent, total)
            let shown = rubberBand(current - drag, min: peekHeight, max: full)

            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    Capsule()
                        .fill(Color.primary.opacity(0.28))
                        .frame(width: 38, height: 5)
                        .padding(.top, 8)
                        .padding(.bottom, 6)
                    header
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headerHeight = $0 }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 4, coordinateSpace: .global)
                        .onChanged { value in
                            var t = Transaction()
                            t.disablesAnimations = true
                            withTransaction(t) { drag = value.translation.height }
                        }
                        .onEnded { value in
                            // Where a flick would carry the panel, so a quick swipe goes to the next height.
                            let travelled = value.translation.height + 0.35 * (value.predictedEndTranslation.height - value.translation.height)
                            let target = current - travelled
                            let options: [PanelDetent] = [.peek, .mid, .full]
                            let next = options.min { abs(height($0, total) - target) < abs(height($1, total) - target) } ?? detent
                            withAnimation(.interpolatingSpring(mass: 1, stiffness: 260, damping: 30, initialVelocity: 0)) {
                                detent = next
                                drag = 0
                            }
                        }
                )

                content
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    // At the middle height the bottom of the panel is below the screen: give that back to the list so
                    // its last stop can scroll into view. At peek the list is hidden anyway, and keeping it laid out
                    // means it is already there while the finger drags the panel up (no pop when it settles).
                    .padding(.bottom, detent == .mid ? max(0, full - current) : 0)
                    .clipped()
            }
            .frame(height: full, alignment: .top)
            .glassCard(radius: 30)
            .padding(.horizontal, 8)
            .offset(y: full - shown)
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            // Height changes made elsewhere (opening a stop, starting a trip) glide too.
            .animation(.interpolatingSpring(mass: 1, stiffness: 260, damping: 30), value: detent)
        }
    }
}

// MARK: - Small controls

/// Round X for closing a card or cancelling.
struct CloseButton: View {
    var label: LocalizedStringKey = "driver.panel.close"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.primary)
                .frame(width: 32, height: 32)
                .background(.glassFill)
                .clipShape(Circle())
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }
}

/// Slide the knob across to confirm. Harder to hit by accident than a button while driving.
struct SlideToConfirm: View {
    let title: LocalizedStringKey
    var tint: Color = Theme.ok
    let action: () -> Void

    @State private var offset: CGFloat = 0
    private let knob: CGFloat = 52

    var body: some View {
        GeometryReader { geo in
            let maxX = max(1, geo.size.width - knob - 8)
            ZStack(alignment: .leading) {
                Capsule().fill(tint.opacity(0.22))
                Text(title)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.leading, knob)
                    .opacity(1 - Double(offset / maxX))
                Circle()
                    .fill(tint)
                    .frame(width: knob, height: knob)
                    .overlay(Image(systemName: "chevron.right.2").font(.system(size: 18, weight: .bold)).foregroundColor(.white))
                    .padding(4)
                    .offset(x: offset)
                    .gesture(
                        DragGesture()
                            .onChanged { offset = min(max(0, $0.translation.width), maxX) }
                            .onEnded { _ in
                                if offset > maxX * 0.82 {
                                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                                    action()
                                }
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { offset = 0 }
                            }
                    )
            }
        }
        .frame(height: 60)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(title))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { action() }
    }
}

/// Numbered stop badge for lists.
struct StopBadge: View {
    let number: Int?
    let stop: PickupStop
    var size: CGFloat = 30

    private var tint: Color {
        if stop.isCompleted { return .gray }
        return stop.isUrgent ? Theme.danger : Theme.pickup
    }

    var body: some View {
        ZStack {
            Circle().fill(tint)
            if stop.isCompleted {
                Image(systemName: "checkmark").font(.system(size: size * 0.42, weight: .heavy)).foregroundColor(.white)
            } else if let number {
                Text("\(number)").font(.system(size: size * 0.5, weight: .heavy)).foregroundColor(.white).monospacedDigit()
            }
        }
        .frame(width: size, height: size)
    }
}

/// Waze-style banner: the next turn and how far away it is.
struct StepBanner: View {
    let maneuver: DriverRoutePlanner.Maneuver
    let destination: String

    private var icon: String {
        let t = maneuver.text.lowercased()
        if maneuver.isArrival { return "mappin.circle.fill" }
        if t.contains("u-turn") || t.contains("întoarce") || t.contains("intoarce") { return "arrow.uturn.left" }
        if t.contains("roundabout") || t.contains("giratoriu") { return "arrow.triangle.turn.up.right.circle.fill" }
        if t.contains("left") || t.contains("stânga") || t.contains("stanga") { return "arrow.turn.up.left" }
        if t.contains("right") || t.contains("dreapta") { return "arrow.turn.up.right" }
        return "arrow.up"
    }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 30, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 54, height: 54)
                .background(Theme.pickup)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(DriveFormat.distance(maneuver.meters)).font(.title3.bold()).monospacedDigit()
                Text(maneuver.isArrival || maneuver.text.isEmpty ? String(localized: "driver.step.arrive") : maneuver.text)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .glassCard(radius: 22)
    }
}

// MARK: - Idle: the next stop and the day's list

struct DriverListHeader: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var planner: DriverRoutePlanner
    let onOpen: (PickupStop) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let stop = appState.nextStop {
                summary
                Button { onOpen(stop) } label: { nextRow(stop) }.buttonStyle(.plain)
                Button {
                    appState.startTripToStop(stop)
                } label: {
                    Label(LocalizedStringKey("driver.action.start"), systemImage: "location.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill").font(.system(size: 30)).foregroundColor(Theme.ok)
                    Text("driver.done.title").font(.headline)
                    Text("driver.done.subtitle").font(.subheadline).foregroundColor(.secondary)
                    Button {
                        Navigator.openWaze(to: Shop.coordinate)
                    } label: {
                        Label("driver.done.navigate", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                            .font(.subheadline.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(.glassFill)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }

    private var summary: some View {
        HStack(spacing: 6) {
            Text("driver.summary \(appState.remainingStops.count)").font(.footnote.bold())
            if !planner.legs.isEmpty {
                Text("·").foregroundColor(.secondary)
                Text(DriveFormat.distance(planner.totalMeters)).font(.footnote).foregroundColor(.secondary)
                Text("·").foregroundColor(.secondary)
                Text(DriveFormat.duration(planner.totalSeconds)).font(.footnote).foregroundColor(.secondary)
            } else if planner.isPlanning {
                ProgressView().controlSize(.mini)
            }
            Spacer()
        }
    }

    private func nextRow(_ stop: PickupStop) -> some View {
        HStack(spacing: 12) {
            StopBadge(number: 1, stop: stop, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(stop.customerName).font(.headline).foregroundColor(.primary).lineLimit(1)
                Text(stop.address).font(.subheadline).foregroundColor(.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 2) {
                if let arrive = planner.arrival(of: stop.id) {
                    Text(DriveFormat.clock(arrive)).font(.subheadline.bold()).monospacedDigit().foregroundColor(.primary)
                }
                if let leg = planner.leg(to: stop.id) {
                    Text("\(DriveFormat.duration(leg.seconds))").font(.caption).foregroundColor(.secondary)
                }
            }
            if stop.isUrgent {
                Image(systemName: "exclamationmark.circle.fill").foregroundColor(Theme.danger)
            }
        }
        .contentShape(Rectangle())
    }
}

struct DriverStopList: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var planner: DriverRoutePlanner
    let onOpen: (PickupStop) -> Void

    @State private var reordering = false

    var body: some View {
        List {
            Section {
                ForEach(appState.remainingStops) { stop in
                    row(stop)
                        .listRowBackground(Color.clear)
                }
                .onMove { appState.moveRemaining(from: $0, to: $1) }
            } header: {
                HStack {
                    Text("driver.list.upcoming").font(.footnote.bold()).textCase(nil)
                    Spacer()
                    if appState.remainingStops.count > 1 {
                        Button {
                            withAnimation { reordering.toggle() }
                        } label: {
                            Text(LocalizedStringKey(reordering ? "driver.list.done_button" : "driver.list.reorder")).font(.footnote.bold()).textCase(nil)
                        }
                    }
                }
            }

            if !appState.completedStops.isEmpty {
                Section {
                    ForEach(appState.completedStops) { stop in
                        row(stop).listRowBackground(Color.clear).opacity(0.6)
                    }
                } header: {
                    Text("driver.list.done").font(.footnote.bold()).textCase(nil)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.editMode, .constant(reordering ? .active : .inactive))
    }

    private func row(_ stop: PickupStop) -> some View {
        Button { onOpen(stop) } label: {
            HStack(spacing: 12) {
                StopBadge(number: appState.number(of: stop), stop: stop)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(stop.customerName).font(.subheadline.bold()).foregroundColor(.primary).lineLimit(1)
                        if stop.isUrgent && !stop.isCompleted {
                            Text("common.urgent").font(.system(size: 9, weight: .heavy)).padding(.horizontal, 5).padding(.vertical, 1)
                                .background(Theme.danger).foregroundColor(.white).clipShape(Capsule())
                        }
                    }
                    Text(stop.address).font(.caption).foregroundColor(.secondary).lineLimit(1)
                }
                Spacer(minLength: 4)
                if !stop.isCompleted {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let arrive = planner.arrival(of: stop.id) {
                            Text(DriveFormat.clock(arrive)).font(.subheadline.bold()).monospacedDigit().foregroundColor(.primary)
                        } else {
                            Text(stop.scheduledTime).font(.subheadline).monospacedDigit().foregroundColor(.secondary)
                        }
                        if let leg = planner.leg(to: stop.id) {
                            Text("\(DriveFormat.distance(leg.meters)) · \(DriveFormat.duration(leg.seconds))").font(.caption2).foregroundColor(.secondary)
                        }
                    }
                } else {
                    Text(stop.scheduledTime).font(.caption).foregroundColor(.secondary).monospacedDigit()
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - One stop

struct StopDetailHeader: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var planner: DriverRoutePlanner
    let stop: PickupStop
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                StopBadge(number: appState.number(of: stop), stop: stop, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(stop.customerName).font(.title3.bold()).lineLimit(1)
                    Text(stop.address).font(.subheadline).foregroundColor(.secondary).lineLimit(2)
                }
                Spacer(minLength: 4)
                CloseButton(action: onClose)
            }

            if !stop.isCompleted {
                Button {
                    appState.startTripToStop(stop)
                } label: {
                    Label(LocalizedStringKey("driver.action.start"), systemImage: "location.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }
}

struct StopDetailContent: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var planner: DriverRoutePlanner
    let stop: PickupStop

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    chip(LocalizedStringKey(stop.type.localizedTitleKey), tint: Theme.pickup)
                    if stop.isUrgent { chip("common.urgent", tint: Theme.danger, filled: true) }
                    chip(LocalizedStringKey(stop.isCompleted ? "driver.stop.completed" : "driver.stop.pending"), tint: stop.isCompleted ? .gray : Theme.shop)
                }

                if let leg = planner.leg(to: stop.id), !stop.isCompleted {
                    HStack(spacing: 16) {
                        stat("clock", DriveFormat.duration(leg.seconds))
                        stat("road.lanes", DriveFormat.distance(leg.meters))
                        if let arrive = planner.arrival(of: stop.id) { stat("flag.checkered", DriveFormat.clock(arrive)) }
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    info("clock.fill", "driver.stop.window", stop.scheduledTime)
                    info("doc.text.fill", "driver.stop.booking", stop.bookingCode)
                    info("phone.fill", "driver.stop.contact", stop.customerPhone)
                }

                HStack(spacing: 10) {
                    NavigateMenu(stop: stop)
                    Button { call(stop.customerPhone) } label: {
                        Label(LocalizedStringKey("driver.stop.call"), systemImage: "phone.fill")
                            .font(.subheadline.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(.glassFill)
                            .foregroundColor(.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }

                if !stop.isCompleted, appState.nextStop?.id != stop.id {
                    Button { appState.makeNext(stop) } label: {
                        Label("driver.stop.make_next", systemImage: "arrow.up.to.line")
                            .font(.subheadline.bold())
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(.glassFill)
                            .foregroundColor(.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }

    private func chip(_ key: LocalizedStringKey, tint: Color, filled: Bool = false) -> some View {
        Text(key).font(.caption.bold())
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(filled ? tint : tint.opacity(0.15))
            .foregroundColor(filled ? .white : tint)
            .clipShape(Capsule())
    }

    private func stat(_ icon: String, _ value: String) -> some View {
        Label(value, systemImage: icon).font(.subheadline.bold()).monospacedDigit()
    }

    private func info(_ icon: String, _ title: LocalizedStringKey, _ value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundColor(.secondary).frame(width: 22)
            Text(title).foregroundColor(.secondary)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
        .font(.subheadline)
    }
}

// MARK: - On the way

struct DriverTripHeader: View {
    @EnvironmentObject var appState: AppState
    @ObservedObject var planner: DriverRoutePlanner
    let stop: PickupStop
    @State private var confirmCancel = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(planner.hasRoute(to: stop.id) ? "\(appState.etaMinutes)" : "–")
                            .font(.system(size: 38, weight: .bold, design: .rounded)).monospacedDigit()
                        Text("min").font(.title3.bold())
                        if let arrive = planner.arrival(of: stop.id) {
                            Text("driver.trip.arrive \(DriveFormat.clock(arrive))").font(.subheadline).foregroundColor(.secondary)
                        }
                    }
                    Text("\(DriveFormat.distance(planner.metersLeft)) · \(stop.customerName)")
                        .font(.subheadline).foregroundColor(.secondary).lineLimit(1)
                }
                Spacer(minLength: 4)
                CloseButton(label: "driver.trip.cancel") { confirmCancel = true }
            }
            SlideToConfirm(title: "driver.trip.slide", tint: Theme.ok) {
                appState.completeCurrentStop()
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
        .confirmationDialog("driver.trip.cancel_title", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("driver.trip.cancel", role: .destructive) { appState.cancelTrip() }
            Button("driver.trip.keep", role: .cancel) {}
        } message: {
            Text("driver.trip.cancel_message \(stop.customerName)")
        }
    }
}
