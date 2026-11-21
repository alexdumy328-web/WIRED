import SwiftUI

struct DriverRadarCard: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Circle()
                        .fill(appState.isDriverEnRoute ? Color.green : Color.orange)
                        .frame(width: 10, height: 10)
                        .overlay(
                            Circle()
                                .stroke(appState.isDriverEnRoute ? Color.green.opacity(0.4) : Color.clear, lineWidth: 6)
                                .scaleEffect(appState.isDriverEnRoute ? 1.5 : 1.0)
                        )

                    Text(appState.isDriverEnRoute ? "ȘOFER ÎN MIȘCARE" : "ȘOFER LA ATELIER")
                        .font(.caption.bold())
                        .foregroundColor(appState.isDriverEnRoute ? .green : .orange)
                }

                Spacer()

                if appState.isDriverEnRoute {
                    Text("~\(appState.etaMinutes) min")
                        .font(.subheadline.bold())
                        .foregroundColor(.blue)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.12))
                        .clipShape(Capsule())
                }
            }

            if appState.isDriverEnRoute, let stop = appState.currentEnRouteStop {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Destinație: \(stop.address)")
                        .font(.headline)
                        .lineLimit(1)
                    Text("Client: \(stop.customerName) • Cod: \(stop.bookingCode)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            } else {
                Text("Șoferul este în așteptare la sediul din Iași.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
