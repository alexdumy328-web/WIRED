import SwiftUI
import Charts

/// Owner-only numbers: volume and income by week or month, status mix and categories.
struct StatsView: View {
    @EnvironmentObject var store: OwnerStore

    private enum Span: Hashable { case weekly, monthly }

    @State private var state: LoadState<Stats> = .loading
    @State private var span: Span = .weekly

    var body: some View {
        Group {
            switch state {
            case .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let text): ErrorBanner(message: text) { Task { await load() } }
            case .loaded(let stats): content(stats)
            }
        }
        .navigationTitle(LocalizedStringKey("console.stats.title"))
        .refreshable { await load() }
        .task(id: store.version) { await load() }
    }

    private func points(_ stats: Stats) -> [TrendPoint] {
        guard let trend = stats.trend else { return [] }
        return span == .weekly ? trend.weekly : trend.monthly
    }

    private func label(for date: Date) -> String {
        let day = ShopCalendar.dateString(date)
        return span == .weekly ? ShopCalendar.dayMonth(day) : ShopCalendar.month(day)
    }

    /// Evenly thinned indices so the X axis shows at most 4 readable labels without crowding.
    static func tickIndices(count: Int, maxTicks: Int = 4) -> [Int] {
        guard count > 0 else { return [] }
        guard count > maxTicks else { return Array(0..<count) }
        var out: [Int] = []
        let step = Double(count - 1) / Double(maxTicks - 1)
        for i in 0..<maxTicks {
            let idx = Int((Double(i) * step).rounded())
            if out.last != idx { out.append(idx) }
        }
        return out
    }

    /// Compact axis labels so large lei figures ("12.5k") do not squeeze the plot area.
    static func compactAxisNumber(_ value: Double) -> String {
        let absVal = abs(value)
        if absVal >= 1_000_000 {
            return String(format: "%.1fM", value / 1_000_000).replacingOccurrences(of: ".0M", with: "M")
        }
        if absVal >= 1_000 {
            return String(format: "%.1fk", value / 1_000).replacingOccurrences(of: ".0k", with: "k")
        }
        return "\(Int(value.rounded()))"
    }

    private func tickDates(for series: [TrendPoint]) -> [Date] {
        Self.tickIndices(count: series.count).map { ShopCalendar.date(series[$0].start) }
    }

    private func content(_ stats: Stats) -> some View {
        let series = points(stats)
        let ticks = tickDates(for: series)
        let unit: Calendar.Component = span == .weekly ? .weekOfYear : .month
        let createdLabel = String(localized: "console.stats.created")
        let doneLabel = String(localized: "console.stats.done")
        let repairsLabel = String(localized: "console.stats.repairs")
        let transportLabel = String(localized: "console.stats.transport")

        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    KpiCard(icon: "tray.full.fill", tint: Theme.shop, title: "console.stats.total", value: "\(stats.total)")
                    KpiCard(icon: "wrench.and.screwdriver.fill", tint: Theme.violet, title: "console.stats.active", value: "\(stats.active)")
                    KpiCard(icon: "banknote.fill", tint: Theme.ok, title: "console.stats.income", value: Money.lei(stats.revenue.doneLei))
                    KpiCard(icon: "hourglass", tint: Theme.mobile, title: "console.stats.pipeline", value: Money.lei(stats.revenue.pipelineLei))
                    if let w = stats.warranties {
                        KpiCard(icon: "checkmark.shield.fill", tint: Theme.ok, title: "console.stats.warranties", value: "\(w.valid)")
                        KpiCard(icon: "clock.badge.exclamationmark.fill", tint: Theme.rose, title: "console.stats.expiring", value: "\(w.expiring)")
                    }
                }

                Picker("", selection: $span) {
                    Text("console.stats.weekly").tag(Span.weekly)
                    Text("console.stats.monthly").tag(Span.monthly)
                }
                .pickerStyle(.segmented)

                if series.isEmpty {
                    Text("console.stats.no_trend").foregroundColor(.secondary)
                } else {
                    card("console.stats.jobs") {
                        Chart {
                            ForEach(series) { p in
                                let date = ShopCalendar.date(p.start)
                                BarMark(x: .value("Period", date, unit: unit), y: .value("Jobs", p.created))
                                    .foregroundStyle(by: .value("Series", createdLabel))
                                    .position(by: .value("Series", createdLabel), axis: .horizontal, span: .ratio(0.75))
                                    .cornerRadius(3)
                                BarMark(x: .value("Period", date, unit: unit), y: .value("Jobs", p.done))
                                    .foregroundStyle(by: .value("Series", doneLabel))
                                    .position(by: .value("Series", doneLabel), axis: .horizontal, span: .ratio(0.75))
                                    .cornerRadius(3)
                            }
                        }
                        .chartForegroundStyleScale([
                            createdLabel: Theme.shop,
                            doneLabel: Theme.ok,
                        ])
                        .chartXAxis {
                            AxisMarks(values: ticks) { value in
                                AxisGridLine()
                                AxisTick()
                                if let date = value.as(Date.self) {
                                    AxisValueLabel {
                                        Text(label(for: date))
                                            .font(.caption2)
                                            .fixedSize()
                                    }
                                }
                            }
                        }
                        .chartYAxis {
                            AxisMarks(position: .leading) { value in
                                AxisGridLine()
                                if let count = value.as(Int.self) {
                                    AxisValueLabel {
                                        Text("\(count)").font(.caption2)
                                    }
                                }
                            }
                        }
                        .chartLegend(position: .bottom, alignment: .leading, spacing: 12)
                        .frame(height: 210)
                    }

                    card("console.stats.income_chart") {
                        Chart {
                            ForEach(series) { p in
                                let date = ShopCalendar.date(p.start)
                                BarMark(x: .value("Period", date, unit: unit), y: .value("Lei", p.doneLei))
                                    .foregroundStyle(by: .value("Series", repairsLabel))
                                    .cornerRadius(3)
                                BarMark(x: .value("Period", date, unit: unit), y: .value("Lei", p.transportLei))
                                    .foregroundStyle(by: .value("Series", transportLabel))
                                    .cornerRadius(3)
                            }
                        }
                        .chartForegroundStyleScale([
                            repairsLabel: Theme.shop,
                            transportLabel: Theme.pickup,
                        ])
                        .chartXAxis {
                            AxisMarks(values: ticks) { value in
                                AxisGridLine()
                                AxisTick()
                                if let date = value.as(Date.self) {
                                    AxisValueLabel {
                                        Text(label(for: date))
                                            .font(.caption2)
                                            .fixedSize()
                                    }
                                }
                            }
                        }
                        .chartYAxis {
                            AxisMarks(position: .leading) { value in
                                AxisGridLine()
                                if let amount = value.as(Double.self) {
                                    AxisValueLabel {
                                        Text(Self.compactAxisNumber(amount)).font(.caption2)
                                    }
                                }
                            }
                        }
                        .chartLegend(position: .bottom, alignment: .leading, spacing: 12)
                        .frame(height: 210)
                    }
                }

                card("console.stats.by_status") {
                    let rows = BookingStatus.allCases
                        .map { StatsBarRow(id: $0.rawValue, label: String(localized: String.LocalizationValue($0.titleKey)), value: stats.byStatus[$0.rawValue] ?? 0, color: $0.color) }
                        .filter { $0.value > 0 }
                    StatsBarList(rows: rows)
                }

                card("console.stats.by_category") {
                    let rows = stats.byCategory
                        .sorted { $0.value > $1.value }
                        .map { StatsBarRow(id: $0.key, label: categoryName($0.key), value: $0.value, color: Theme.shop) }
                    StatsBarList(rows: rows)
                }
            }
            .padding(16)
        }
    }

    private func categoryName(_ key: String) -> String {
        let k = "console.stats.cat.\(key)"
        let text = NSLocalizedString(k, comment: "")
        return text == k ? key.capitalized : text
    }

    private func card<Content: View>(_ title: LocalizedStringKey, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            content()
        }
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func load() async {
        do { state = .loaded(try await store.repo.stats()) }
        catch { state = .failed(error.localizedDescription) }
    }
}

private struct StatsBarRow: Identifiable {
    let id: String
    let label: String
    let value: Int
    let color: Color
}

/// Horizontal bar breakdown matching the website's RowChart, keeping labels and counts clear at any width.
private struct StatsBarList: View {
    let rows: [StatsBarRow]

    private var maxValue: Int { max(1, rows.map(\.value).max() ?? 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(row.label)
                            .font(.subheadline)
                            .foregroundColor(.primary)
                            .lineLimit(2)
                        Spacer(minLength: 8)
                        Text("\(row.value)")
                            .font(.subheadline.bold().monospacedDigit())
                            .foregroundColor(.secondary)
                    }
                    GeometryReader { geo in
                        let fraction = CGFloat(row.value) / CGFloat(maxValue)
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.primary.opacity(0.08))
                            Capsule()
                                .fill(row.color)
                                .frame(width: row.value > 0 ? max(6, geo.size.width * fraction) : 0)
                        }
                    }
                    .frame(height: 8)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}
