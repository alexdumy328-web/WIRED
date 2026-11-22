import SwiftUI
import MapKit

struct DriverMapView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var locationService: LocationService
    @Binding var selectedStop: PickupStop?
    @State private var showingStopsList: Bool = false
    @State private var route: MKRoute?

    @State private var cameraPosition: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 47.163, longitude: 27.585),
            span: MKCoordinateSpan(latitudeDelta: 0.065, longitudeDelta: 0.065)
        )
    )

    var nextStop: PickupStop? {
        appState.stops.first(where: { !$0.isCompleted })
    }

    /// The stop the route leads to: the one in progress, else the next one.
    var routeTarget: PickupStop? {
        appState.currentEnRouteStop ?? nextStop
    }

    /// Changes when the route has to be drawn again.
    private var routeKey: String {
        "\(routeTarget?.id ?? "none")-\(appState.isDriverEnRoute)"
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            // MapKit View
            Map(position: $cameraPosition) {
                // Shop Base
                Marker(MockData.shopName, systemImage: "wrench.and.screwdriver.fill", coordinate: MockData.shopCoordinate)
                    .tint(.blue)

                // Driving route to the current target
                if let route {
                    MapPolyline(route.polyline)
                        .stroke(Theme.pickup, style: StrokeStyle(lineWidth: 6, lineCap: .round, lineJoin: .round))
                }

                // Customer Stops
                ForEach(appState.stops) { stop in
                    Annotation("", coordinate: stop.coordinate) {
                        Button {
                            selectedStop = stop
                        } label: {
                            StopPin(stop: stop)
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
                    .glassCard(radius: 14)

                    Spacer()

                    Button {
                        showingStopsList = true
                    } label: {
                        Label("Listă opriri", systemImage: "list.bullet")
                            .font(.subheadline.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .glassCard(radius: 20)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)

                Spacer()
            }

            // Recenter controls, under the top bar so nothing covers them
            VStack {
                HStack {
                    Spacer()
                    recenterControls
                }
                .padding(.horizontal, 16)
                .padding(.top, 66)

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
        .task(id: routeKey) {
            await loadRoute()
        }
    }

    // MARK: - Route

    /// Asks Apple Maps for the driving route and frames it on the map.
    private func loadRoute() async {
        guard let target = routeTarget else {
            route = nil
            return
        }
        let origin = appState.isDriverEnRoute ? appState.driverCoordinate : MockData.shopCoordinate
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: origin))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: target.coordinate))
        request.transportType = .automobile
        do {
            let response = try await MKDirections(request: request).calculate()
            guard let best = response.routes.first else { return }
            route = best
            fitRoute()
        } catch {
            route = nil
        }
    }

    // MARK: - Recenter

    /// Frames the whole route. Extra room at the bottom so the card does not cover its start.
    private func fitRoute() {
        guard let route else { return }
        let rect = route.polyline.boundingMapRect
        withAnimation {
            cameraPosition = .rect(MKMapRect(
                x: rect.minX - rect.width * 0.25,
                y: rect.minY - rect.height * 0.15,
                width: rect.width * 1.5,
                height: rect.height * 1.9
            ))
        }
    }

    private func center(on coordinate: CLLocationCoordinate2D) {
        withAnimation {
            cameraPosition = .region(MKCoordinateRegion(
                center: coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)
            ))
        }
    }

    /// The driver: the live position on a trip, else the last GPS fix, else the workshop.
    private var driverPosition: CLLocationCoordinate2D {
        if appState.isDriverEnRoute { return appState.driverCoordinate }
        return locationService.currentLocation?.coordinate ?? MockData.shopCoordinate
    }

    private var recenterControls: some View {
        VStack(spacing: 0) {
            recenterButton(icon: "arrow.up.left.and.arrow.down.right", label: "driver.map.fit_route") {
                if route != nil { fitRoute() } else { center(on: MockData.shopCoordinate) }
            }
            Divider().frame(width: 28)
            recenterButton(icon: "location.fill", label: "driver.map.center_driver") {
                center(on: driverPosition)
            }
            Divider().frame(width: 28)
            recenterButton(icon: "wrench.and.screwdriver.fill", label: "driver.map.center_shop") {
                center(on: MockData.shopCoordinate)
            }
        }
        .glassCard(radius: 14)
    }

    private func recenterButton(icon: String, label: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 44, height: 44)
        }
        .foregroundColor(.primary)
        .accessibilityLabel(Text(label))
    }

    @ViewBuilder
    private var routeSummary: some View {
        if let route {
            Label(
                String(format: "%.1f km · ~%d min", route.distance / 1000, Int(ceil(route.expectedTravelTime / 60))),
                systemImage: "arrow.triangle.turn.up.right.circle.fill"
            )
            .font(.footnote.bold())
            .foregroundColor(Theme.pickup)
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
                    .background(Theme.pickup.opacity(0.15))
                    .foregroundColor(Theme.pickup)
                    .clipShape(Capsule())

                if stop.isUrgent {
                    Text(LocalizedStringKey("common.urgent"))
                        .font(.caption2.bold())
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(Theme.danger)
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

            routeSummary

            Divider()

            HStack(spacing: 12) {
                NavigateMenu(stop: stop)

                // Call button
                Button {
                    callCustomer(phone: stop.customerPhone)
                } label: {
                    Label(LocalizedStringKey("driver.stop.call"), systemImage: "phone.fill")
                        .font(.subheadline.bold())
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(.glassFill)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }

            // Primary "Plec spre client" Action Button
            Button {
                appState.startTripToStop(stop)
            } label: {
                Label(LocalizedStringKey("driver.action.start"), systemImage: "location.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(16)
        .glassCard()
    }

    @ViewBuilder
    private func activeNavigationCard(stop: PickupStop) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Theme.ok)
                            .frame(width: 8, height: 8)
                        Text(LocalizedStringKey("driver.action.en_route"))
                            .font(.caption.bold())
                            .foregroundColor(Theme.ok)
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
                        .foregroundColor(Theme.pickup)
                    Text("Timp estimat")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }

            routeSummary

            NavigateMenu(stop: stop)

            HStack(spacing: 10) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .foregroundColor(Theme.pickup)
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
                    .background(Theme.ok)
                    .foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(16)
        .glassCard()
    }

    private var allCompletedCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 32))
                .foregroundColor(Theme.ok)
            Text("Toate opririle au fost finalizate!")
                .font(.headline)
            Text("Felicitări! Întoarce-te la atelierul Norgelis Tech.")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .glassCard()
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

/// Round map pin for a stop. One shape for every state, so nothing pokes out of a circle.
struct StopPin: View {
    let stop: PickupStop

    private var tint: Color {
        if stop.isCompleted { return .gray }
        return stop.isUrgent ? Theme.danger : Theme.pickup
    }

    private var icon: String {
        if stop.isCompleted { return "checkmark" }
        return stop.isUrgent ? "exclamationmark" : "mappin"
    }

    var body: some View {
        VStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .heavy))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .background(Circle().fill(tint))
                .overlay(Circle().stroke(Color.white, lineWidth: 2.5))
                .shadow(color: .black.opacity(0.3), radius: 3, y: 1)

            Text(stop.bookingCode)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.primary)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(Color(.systemBackground).opacity(0.9))
                .clipShape(Capsule())
        }
    }
}
