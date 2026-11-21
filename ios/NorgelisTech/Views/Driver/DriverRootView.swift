import SwiftUI

struct DriverRootView: View {
    @State private var selectedStop: PickupStop?

    var body: some View {
        DriverMapView(selectedStop: $selectedStop)
            .sheet(item: $selectedStop) { stop in
                StopDetailSheet(stop: stop)
            }
    }
}
