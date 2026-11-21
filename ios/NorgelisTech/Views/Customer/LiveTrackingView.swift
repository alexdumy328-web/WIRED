import SwiftUI
import MapKit

struct LiveTrackingView: View {
    @EnvironmentObject var appState: AppState
    let booking: Booking
    let stop: PickupStop

    @State private var cameraPosition: MapCameraPosition = .automatic

    var body: some View {
        VStack(spacing: 0) {
            // Live banner
            HStack {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 10, height: 10)
                        .overlay(
                            Circle()
                                .stroke(Color.green.opacity(0.3), lineWidth: 6)
                                .scaleEffect(1.4)
                        )
                    Text(LocalizedStringKey("customer.driver.live_badge"))
                        .font(.caption.bold())
                        .foregroundColor(.green)
                }

                Spacer()

                Text("Sosire în ~\(appState.etaMinutes) min")
                    .font(.subheadline.bold())
                    .foregroundColor(.blue)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color.green.opacity(0.12))

            // MapKit view showing driver approaching customer
            Map(position: $cameraPosition) {
                // Customer destination marker
                Marker("Adresa ta", systemImage: "house.fill", coordinate: stop.coordinate)
                    .tint(.red)

                // Live driver position marker
                Annotation("Șofer Norgelis", coordinate: appState.driverCoordinate) {
                    ZStack {
                        Circle()
                            .fill(Color.blue.opacity(0.2))
                            .frame(width: 44, height: 44)
                        Image(systemName: "car.fill")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 28, height: 28)
                            .background(Circle().fill(Color.blue))
                    }
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(16)

            // Info footer
            VStack(alignment: .leading, spacing: 10) {
                Text(LocalizedStringKey("customer.driver.on_the_way"))
                    .font(.headline)
                Text("Șoferul se deplasează spre \(stop.address).")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
