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

    private func label(_ start: String) -> String {
        span == .weekly ? ShopCalendar.dayNumber(start) + " " + ShopCalendar.month(start) : ShopCalendar.month(start)
    }

    private func content(_ stats: Stats) -> some View {
        let series = points(stats)
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
                                BarMark(x: .value("Period", label(p.start)), y: .value("Jobs", p.created))
                                    .foregroundStyle(by: .value("Series", String(localized: "console.stats.created")))
                                    .position(by: .value("Series", String(localized: "console.stats.created")))
                                BarMark(x: .value("Period", label(p.start)), y: .value("Jobs", p.done))
                                    .foregroundStyle(by: .value("Series", String(localized: "console.stats.done")))
                                    .position(by: .value("Series", String(localized: "console.stats.done")))
                            }
                        }
                        .chartForegroundStyleScale([
                            String(localized: "console.stats.created"): Theme.shop,
                            String(localized: "console.stats.done"): Theme.ok,
                        ])
                        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) }
                        .frame(height: 190)
                    }

                    card("console.stats.income_chart") {
                        Chart {
                            ForEach(series) { p in
                                BarMark(x: .value("Period", label(p.start)), y: .value("Lei", p.doneLei))
                                    .foregroundStyle(by: .value("Series", String(localized: "console.stats.repairs")))
                                BarMark(x: .value("Period", label(p.start)), y: .value("Lei", p.transportLei))
                                    .foregroundStyle(by: .value("Series", String(localized: "console.stats.transport")))
                            }
                        }
                        .chartForegroundStyleScale([
                            String(localized: "console.stats.repairs"): Theme.shop,
                            String(localized: "console.stats.transport"): Theme.pickup,
                        ])
                        .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) }
                        .frame(height: 190)
                    }
                }

                card("console.stats.by_status") {
                    let rows = BookingStatus.allCases.map { ($0, stats.byStatus[$0.rawValue] ?? 0) }.filter { $0.1 > 0 }
                    Chart(rows, id: \.0) { row in
                        BarMark(x: .value("Jobs", row.1), y: .value("Status", String(localized: String.LocalizationValue(row.0.titleKey))))
                            .foregroundStyle(row.0.color)
                            .annotation(position: .trailing) { Text("\(row.1)").font(.caption).foregroundColor(.secondary) }
                    }
                    .chartYAxis { AxisMarks { _ in AxisValueLabel() } }
                    .frame(height: CGFloat(max(rows.count, 1)) * 34 + 10)
                }

                card("console.stats.by_category") {
                    let rows = stats.byCategory.sorted { $0.value > $1.value }
                    Chart(rows, id: \.key) { row in
                        BarMark(x: .value("Jobs", row.value), y: .value("Category", categoryName(row.key)))
                            .foregroundStyle(Theme.shop)
                            .annotation(position: .trailing) { Text("\(row.value)").font(.caption).foregroundColor(.secondary) }
                    }
                    .chartYAxis { AxisMarks { _ in AxisValueLabel() } }
                    .frame(height: CGFloat(max(rows.count, 1)) * 34 + 10)
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
        VStack(alignment: .leading, spacing: 10) {
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
