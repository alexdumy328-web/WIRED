import SwiftUI

struct DriverRadarCard: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Circle()
                        .fill(appState.isDriverEnRoute ? Theme.ok : Theme.shop)
                        .frame(width: 10, height: 10)
                        .overlay(
                            Circle()
                                .stroke(appState.isDriverEnRoute ? Theme.ok.opacity(0.4) : Color.clear, lineWidth: 6)
                                .scaleEffect(appState.isDriverEnRoute ? 1.5 : 1.0)
                        )

                    Text(LocalizedStringKey(appState.isDriverEnRoute ? "radar.moving" : "radar.at_shop"))
                        .font(.caption.bold())
                        .foregroundColor(appState.isDriverEnRoute ? Theme.ok : Theme.shop)
                }

                Spacer()

                if appState.isDriverEnRoute {
                    Text("~\(appState.etaMinutes) min")
                        .font(.subheadline.bold())
                        .foregroundColor(Theme.pickup)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Theme.pickup.opacity(0.12))
                        .clipShape(Capsule())
                }
            }

            if appState.isDriverEnRoute, let stop = appState.currentEnRouteStop {
                VStack(alignment: .leading, spacing: 4) {
                    Text("radar.destination \(stop.address)")
                        .font(.headline)
                        .lineLimit(1)
                    Text("radar.client \(stop.customerName) \(stop.bookingCode)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            } else {
                Text("radar.waiting")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
