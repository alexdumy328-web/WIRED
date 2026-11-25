import SwiftUI

/// Faint circuit-board traces with slow gold signals running along them,
/// matching the website's `TraceField.tsx` for entry and brand screens.
/// Stays static (without moving signals) when Reduce Motion is enabled.
struct TraceFieldView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Overall strength multiplier (1.0 on Welcome, lower on secondary entry screens).
    var intensity: Double = 1.0

    private static let virtualWidth: CGFloat = 430
    private static let virtualHeight: CGFloat = 932
    private static let traces: [Trace] = makeTraces(count: 18)

    private struct Trace {
        let points: [CGPoint]
        let duration: Double
        let delay: Double
        let hasStartPad: Bool
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion)) { timeline in
            let now = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                let scale = max(size.width / Self.virtualWidth, size.height / Self.virtualHeight)
                let offsetX = (size.width - Self.virtualWidth * scale) / 2
                let offsetY = (size.height - Self.virtualHeight * scale) / 2

                let lineOpacity = (colorScheme == .dark ? 0.12 : 0.09) * intensity
                let lineColor = Color.primary.opacity(lineOpacity)
                let signalOpacity = (colorScheme == .dark ? 0.52 : 0.40) * intensity
                let signalColor = Theme.shop.opacity(signalOpacity)

                let lineStyle = StrokeStyle(lineWidth: 1.3, lineCap: .round, lineJoin: .round)
                let signalStyle = StrokeStyle(lineWidth: 1.9, lineCap: .round, lineJoin: .round)

                for trace in Self.traces {
                    var path = Path()
                    for (i, pt) in trace.points.enumerated() {
                        let mapped = CGPoint(x: pt.x * scale + offsetX, y: pt.y * scale + offsetY)
                        if i == 0 { path.move(to: mapped) } else { path.addLine(to: mapped) }
                    }

                    context.stroke(path, with: .color(lineColor), style: lineStyle)

                    // Circular via pad at the end of the trace (and occasionally at the start).
                    if let end = trace.points.last {
                        let center = CGPoint(x: end.x * scale + offsetX, y: end.y * scale + offsetY)
                        let r: CGFloat = 3.5
                        let via = Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2))
                        context.stroke(via, with: .color(lineColor), lineWidth: 1.3)
                    }
                    if trace.hasStartPad, let start = trace.points.first {
                        let center = CGPoint(x: start.x * scale + offsetX, y: start.y * scale + offsetY)
                        let r: CGFloat = 2.5
                        let pad = Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2))
                        context.fill(pad, with: .color(lineColor))
                    }

                    // Gold signal pulse gliding along the route (disabled under Reduce Motion).
                    if !reduceMotion {
                        let cycle = ((now + trace.delay).truncatingRemainder(dividingBy: trace.duration) + trace.duration)
                            .truncatingRemainder(dividingBy: trace.duration) / trace.duration
                        let pulseLength: CGFloat = 0.14
                        let head = CGFloat(cycle) * (1 + pulseLength)
                        let tail = max(0, head - pulseLength)
                        let clampedHead = min(1, head)
                        if clampedHead > tail {
                            let segment = path.trimmedPath(from: tail, to: clampedHead)
                            context.stroke(segment, with: .color(signalColor), style: signalStyle)
                        }
                    }
                }
            }
        }
        // Subtle center wash so traces glow softly through the glass without overpowering text.
        .overlay {
            RadialGradient(
                colors: [
                    Color(.systemBackground).opacity(0.24),
                    Color(.systemBackground).opacity(0.10),
                    Color(.systemBackground).opacity(0.0),
                ],
                center: UnitPoint(x: 0.5, y: 0.48),
                startRadius: 20,
                endRadius: 340
            )
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Deterministic LCG matching `TraceField.tsx` so the board layout is consistent across launches.
    private static func makeTraces(count: Int) -> [Trace] {
        var seed: UInt64 = 7
        func next() -> Double {
            seed = (seed &* 1_664_525 &+ 1_013_904_223) % 4_294_967_296
            return Double(seed) / 4_294_967_296.0
        }

        var out: [Trace] = []
        out.reserveCapacity(count)
        for i in 0..<count {
            var x = (next() * Double(virtualWidth)).rounded()
            var y = (next() * Double(virtualHeight)).rounded()
            var pts = [CGPoint(x: x, y: y)]
            var dir = Int(next() * 4) * 2 // 0, 2, 4, 6 (cardinal multiples of 45°)
            let segments = 3 + Int(next() * 3)
            for _ in 0..<segments {
                let len = 45 + next() * 145
                let angle = Double(dir) * .pi / 4.0
                x = (x + cos(angle) * len).rounded()
                y = (y + sin(angle) * len).rounded()
                pts.append(CGPoint(x: x, y: y))
                dir = (dir + (next() < 0.5 ? 1 : 7)) % 8 // turn ±45°
            }
            let duration = 7.0 + next() * 9.0
            let delay = next() * 16.0
            out.append(Trace(points: pts, duration: duration, delay: delay, hasStartPad: i % 2 == 0))
        }
        return out
    }
}
