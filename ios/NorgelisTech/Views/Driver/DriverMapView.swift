import SwiftUI
import MapKit

/// The driver's day on a map: numbered stops, the planned legs, and one panel for everything else.
struct DriverMapView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var locationService: LocationService
    @ObservedObject var planner: DriverRoutePlanner

    /// Closes the map (back to the previous tab). The sheet covers the tab bar, as in Apple Maps.
    var onClose: (() -> Void)?

    @State private var detent: PanelDetent = .peek
    @State private var following = true
    /// The system sheet is up only while the map is on screen.
    @State private var sheetShown = false
    /// The header's height: the sheet's smallest height.
    @State private var peekHeight: CGFloat = 170

    @State private var cameraPosition: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 47.163, longitude: 27.585),
            span: MKCoordinateSpan(latitudeDelta: 0.065, longitudeDelta: 0.065)
        )
    )

    private var tripStop: PickupStop? { appState.isDriverEnRoute ? appState.currentEnRouteStop : nil }

    var body: some View {
        ZStack(alignment: .bottom) {
            map

            // Top: the next turn while driving, otherwise a one-line summary
            VStack(spacing: 10) {
                if let stop = tripStop, let maneuver = planner.maneuver {
                    StepBanner(maneuver: maneuver, destination: stop.address)
                        .padding(.horizontal, 12)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
            }
            .padding(.top, 8)
            .animation(.easeInOut(duration: 0.25), value: tripStop?.id)

            // Close (top left) and recenter controls (top right)
            VStack {
                HStack(alignment: .top) {
                    if let onClose {
                        Button(action: onClose) {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 16, weight: .semibold))
                                .frame(width: 44, height: 44)
                        }
                        .foregroundColor(.primary)
                        .glassCard(radius: 22)
                        .accessibilityLabel(Text("common.close"))
                    }
                    Spacer()
                    recenterControls
                }
                .padding(.horizontal, 14)
                .padding(.top, tripStop == nil ? 12 : 92)
                Spacer()
            }
        }
        .onAppear { sheetShown = true }
        .onDisappear { sheetShown = false }
        .sheet(isPresented: $sheetShown) {
            panel
                .environmentObject(appState)
                .environmentObject(locationService)
                .presentationDetents([.height(peekHeight), .fraction(PanelDetent.midFraction), .large], selection: detentBinding)
                // The map stays usable under the small and middle heights.
                .presentationBackgroundInteraction(.enabled(upThrough: .fraction(PanelDetent.midFraction)))
                .presentationContentInteraction(.resizes)
                .presentationDragIndicator(.visible)
                .interactiveDismissDisabled()
        }
        .toolbar(onClose == nil ? .automatic : .hidden, for: .tabBar)
        .task { locationService.prepare() }
        .onChange(of: planner.legs.first?.id) { _, _ in
            if tripStop == nil { fitRoute() }
        }
        .onChange(of: appState.driverCoordinate.latitude) { _, _ in
            guard tripStop != nil, following else { return }
            withAnimation(.linear(duration: 0.45)) {
                cameraPosition = .region(MKCoordinateRegion(
                    center: appState.driverCoordinate,
                    span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)
                ))
            }
        }
        .onChange(of: appState.isDriverEnRoute) { _, going in
            following = true
            detent = .peek
            if !going { fitRoute() }
        }
    }

    // MARK: - Map

    private var map: some View {
        Map(position: $cameraPosition) {
            Marker(Shop.name, systemImage: "wrench.and.screwdriver.fill", coordinate: Shop.coordinate)
                .tint(.blue)

            // The first leg is the road ahead; later legs are faint and dashed.
            ForEach(Array(planner.legs.enumerated()), id: \.element.id) { index, leg in
                if index == 0 {
                    MapPolyline(coordinates: leg.coordinates)
                        .stroke(Theme.pickup, style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
                } else {
                    MapPolyline(coordinates: leg.coordinates)
                        .stroke(Theme.pickup.opacity(0.45), style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round, dash: [2, 7]))
                }
            }

            ForEach(appState.stops) { stop in
                Annotation("", coordinate: stop.coordinate) {
                    Button { focus(stop) } label: {
                        StopPin(
                            stop: stop,
                            number: appState.number(of: stop),
                            isNext: stop.id == appState.nextStop?.id,
                            isSelected: stop.id == appState.focusedStopID
                        )
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("\(appState.number(of: stop).map { "\($0). " } ?? "")\(stop.customerName), \(stop.address)"))
                }
            }

            if appState.isDriverEnRoute {
                Annotation("", coordinate: appState.driverCoordinate) {
                    ZStack {
                        Circle().fill(Color.blue.opacity(0.22)).frame(width: 54, height: 54)
                        Image(systemName: "car.fill")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(Color.blue))
                            .overlay(Circle().stroke(Color.white, lineWidth: 2.5))
                            .shadow(radius: 3)
                    }
                }
            }
        }
        .mapControls { MapCompass() }
    }

    // MARK: - Panel

    @ViewBuilder
    private var panel: some View {
        if let stop = tripStop {
            DriverPanel(peekHeight: $peekHeight) {
                DriverTripHeader(planner: planner, stop: stop)
            } content: {
                StopDetailContent(planner: planner, stop: stop)
            }
        } else if let stop = appState.focusedStop {
            DriverPanel(peekHeight: $peekHeight) {
                StopDetailHeader(planner: planner, stop: stop, onClose: closeStop)
            } content: {
                StopDetailContent(planner: planner, stop: stop)
            }
        } else {
            DriverPanel(peekHeight: $peekHeight) {
                DriverListHeader(planner: planner, onOpen: focus)
            } content: {
                DriverStopList(planner: planner, onOpen: focus)
            }
        }
    }

    /// The sheet's height, in the words the rest of the map uses.
    private var detentBinding: Binding<PresentationDetent> {
        Binding(
            get: {
                switch detent {
                case .peek: return .height(peekHeight)
                case .mid: return .fraction(PanelDetent.midFraction)
                case .full: return .large
                }
            },
            set: { value in
                if value == .large { detent = .full } else if value == .fraction(PanelDetent.midFraction) { detent = .mid } else { detent = .peek }
            }
        )
    }

    // MARK: - Camera and focus

    private func focus(_ stop: PickupStop) {
        appState.focusedStopID = stop.id
        detent = .mid
        following = false
        // Put the stop in the upper half, above the panel.
        withAnimation {
            cameraPosition = .region(MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: stop.coordinate.latitude - 0.0025, longitude: stop.coordinate.longitude),
                span: MKCoordinateSpan(latitudeDelta: 0.012, longitudeDelta: 0.012)
            ))
        }
    }

    private func closeStop() {
        appState.focusedStopID = nil
        detent = .peek
        fitRoute()
    }

    /// Frames the road ahead, with room at the bottom for the panel.
    private func fitRoute() {
        guard let leg = planner.legs.first else { return }
        let rect = leg.route.polyline.boundingMapRect
        withAnimation {
            cameraPosition = .rect(MKMapRect(
                x: rect.minX - rect.width * 0.25,
                y: rect.minY - rect.height * 0.2,
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

    private var driverPosition: CLLocationCoordinate2D {
        if appState.isDriverEnRoute { return appState.driverCoordinate }
        return locationService.currentLocation?.coordinate ?? appState.driverCoordinate
    }

    private var recenterControls: some View {
        VStack(spacing: 0) {
            recenterButton(icon: "arrow.up.left.and.arrow.down.right", label: "driver.map.fit_route") {
                following = false
                if planner.legs.isEmpty { center(on: Shop.coordinate) } else { fitRoute() }
            }
            Divider().frame(width: 28)
            recenterButton(icon: "location.fill", label: "driver.map.center_driver") {
                following = true
                center(on: driverPosition)
            }
            Divider().frame(width: 28)
            recenterButton(icon: "wrench.and.screwdriver.fill", label: "driver.map.center_shop") {
                following = false
                center(on: Shop.coordinate)
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
}

/// Round map pin for a stop. Shows its place in today's order, the next one is larger.
struct StopPin: View {
    let stop: PickupStop
    var number: Int?
    var isNext = false
    var isSelected = false

    private var tint: Color {
        if stop.isCompleted { return .gray }
        return stop.isUrgent ? Theme.danger : Theme.pickup
    }

    var body: some View {
        let size: CGFloat = isNext || isSelected ? 38 : 30
        ZStack {
            if isNext && !stop.isCompleted {
                Circle().fill(tint.opacity(0.22)).frame(width: size + 18, height: size + 18)
            }
            ZStack {
                if stop.isCompleted {
                    Image(systemName: "checkmark").font(.system(size: size * 0.42, weight: .heavy))
                } else if let number {
                    Text("\(number)").font(.system(size: size * 0.5, weight: .heavy)).monospacedDigit()
                } else {
                    Image(systemName: "mappin").font(.system(size: size * 0.42, weight: .heavy))
                }
            }
            .foregroundColor(.white)
            .frame(width: size, height: size)
            .background(Circle().fill(tint))
            .overlay(Circle().stroke(Color.white, lineWidth: isSelected ? 4 : 2.5))
            .shadow(color: .black.opacity(0.3), radius: 3, y: 1)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: isNext)
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: isSelected)
    }
}
