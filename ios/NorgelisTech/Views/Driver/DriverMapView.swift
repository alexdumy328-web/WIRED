import SwiftUI
import MapKit

struct DriverMapView: View {
    @EnvironmentObject var appState: AppState
    @Binding var selectedStop: PickupStop?
    @State private var showingStopsList: Bool = false

    @State private var cameraPosition: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 47.163, longitude: 27.585),
            span: MKCoordinateSpan(latitudeDelta: 0.065, longitudeDelta: 0.065)
        )
    )

    var nextStop: PickupStop? {
        appState.stops.first(where: { !$0.isCompleted })
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // MapKit View
            Map(position: $cameraPosition) {
                // Shop Base
                Marker(MockData.shopName, systemImage: "wrench.and.screwdriver.fill", coordinate: MockData.shopCoordinate)
                    .tint(.blue)

                // Customer Stops
                ForEach(appState.stops) { stop in
                    Annotation(stop.bookingCode, coordinate: stop.coordinate) {
                        Button {
                            selectedStop = stop
                        } label: {
                            VStack(spacing: 2) {
                                Image(systemName: stop.isCompleted ? "checkmark.circle.fill" : (stop.isUrgent ? "exclamationmark.triangle.fill" : "mappin.circle.fill"))
                                    .font(.system(size: 26))
                                    .foregroundStyle(stop.isCompleted ? .gray : (stop.isUrgent ? .red : .orange))
                                    .background(Circle().fill(.white))

                                Text(stop.bookingCode)
                                    .font(.system(size: 10, weight: .bold))
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color(.systemBackground).opacity(0.85))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }

                // Driver's Live Position
                if appState.isDriverEnRoute {
                    Annotation("Șofer Norgelis", coordinate: appState.driverCoordinate) {
                        ZStack {
                            Circle()
                                .fill(Color.blue.opacity(0.25))
                                .frame(width: 50, height: 50)
                            Circle()
                                .fill(Color.blue.opacity(0.5))
                                .frame(width: 36, height: 36)
                            Image(systemName: "car.fill")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 30, height: 30)
                                .background(Circle().fill(Color.blue))
                                .shadow(radius: 3)
                        }
                    }
                }
            }
            .mapControls {
                MapUserLocationButton()
                MapCompass()
                MapScaleView()
            }

            // Top Action Controls Overlay
            VStack {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(LocalizedStringKey("driver.title"))
                            .font(.headline)
                        Text(String(format: NSLocalizedString("driver.stops.remaining", comment: ""), appState.stops.filter { !$0.isCompleted }.count))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    Spacer()

                    Button {
                        showingStopsList = true
                    } label: {
                        Label("Listă opriri", systemImage: "list.bullet")
                            .font(.subheadline.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(.ultraThinMaterial)
                            .clipShape(Capsule())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)

                Spacer()
            }

            // Bottom Driver Control Card
            VStack(spacing: 0) {
                if appState.isDriverEnRoute, let stop = appState.currentEnRouteStop {
                    // Active Navigation Mode Card
                    activeNavigationCard(stop: stop)
                } else if let stop = nextStop {
                    // Next Scheduled Stop Card
                    nextStopCard(stop: stop)
                } else {
                    // All stops done card
                    allCompletedCard
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 20)
        }
        .sheet(isPresented: $showingStopsList) {
            StopsListView(selectedStop: $selectedStop)
        }
    }

    // MARK: - Subcards

    @ViewBuilder
    private func nextStopCard(stop: PickupStop) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "clock.fill")
                        .foregroundColor(.secondary)
                    Text(stop.scheduledTime)
                        .font(.subheadline.bold())
                }

                Spacer()

                Text(LocalizedStringKey(stop.type.localizedTitleKey))
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.blue.opacity(0.15))
                    .foregroundColor(.blue)
                    .clipShape(Capsule())

                if stop.isUrgent {
                    Text(LocalizedStringKey("common.urgent"))
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Color.red)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(stop.customerName)
                    .font(.headline)
                Text(stop.address)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            Divider()

            HStack(spacing: 12) {
                // Call button
                Button {
                    callCustomer(phone: stop.customerPhone)
                } label: {
                    Label(LocalizedStringKey("driver.stop.call"), systemImage: "phone.fill")
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Primary "Plec spre client" Action Button
                Button {
                    appState.startTripToStop(stop)
                } label: {
                    Label(LocalizedStringKey("driver.action.start"), systemImage: "location.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.accentColor)
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(16)
        .background(.ultraThickMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.12), radius: 10, y: 5)
    }

    @ViewBuilder
    private func activeNavigationCard(stop: PickupStop) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 8, height: 8)
                        Text(LocalizedStringKey("driver.action.en_route"))
                            .font(.caption.bold())
                            .foregroundColor(.green)
                    }

                    Text(stop.address)
                        .font(.headline)
                        .lineLimit(1)
                }

                Spacer()

                // Live ETA Badge
                VStack(alignment: .trailing, spacing: 2) {
                    Text("~\(appState.etaMinutes) min")
                        .font(.title2.bold())
                        .foregroundColor(.blue)
                    Text("Timp estimat")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            HStack(spacing: 10) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .foregroundColor(.blue)
                Text(LocalizedStringKey("driver.tracking.active"))
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }

            // Finish Stop Button
            Button {
                appState.completeCurrentStop()
            } label: {
                Label(LocalizedStringKey("driver.action.complete_stop"), systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.green)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(16)
        .background(.ultraThickMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.15), radius: 10, y: 5)
    }

    private var allCompletedCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 32))
                .foregroundColor(.green)
            Text("Toate opririle au fost finalizate!")
                .font(.headline)
            Text("Felicitări! Întoarce-te la atelierul Norgelis Tech.")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(.ultraThickMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }

    private func callCustomer(phone: String) {
        let clean = phone.replacingOccurrences(of: " ", with: "")
        if let url = URL(string: "tel://\(clean)") {
            #if os(iOS)
            UIApplication.shared.open(url)
            #endif
        }
    }
}
