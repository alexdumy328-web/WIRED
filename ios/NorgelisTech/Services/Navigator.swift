import SwiftUI
import MapKit
import UIKit

/// Hands a destination to an external navigation app.
enum Navigator {
    /// Opens Waze with turn-by-turn started. Falls back to the Waze web link, which offers the App Store when Waze is missing.
    static func openWaze(to coordinate: CLLocationCoordinate2D) {
        let query = "ll=\(coordinate.latitude),\(coordinate.longitude)&navigate=yes"
        if let app = URL(string: "waze://?\(query)"), UIApplication.shared.canOpenURL(app) {
            UIApplication.shared.open(app)
        } else if let web = URL(string: "https://waze.com/ul?\(query)") {
            UIApplication.shared.open(web)
        }
    }

    /// Opens Apple Maps with driving directions.
    static func openAppleMaps(to coordinate: CLLocationCoordinate2D, name: String) {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
    }
}

/// "Navigate" button with Waze and Apple Maps entries.
struct NavigateMenu: View {
    let stop: PickupStop

    var body: some View {
        Menu {
            Button {
                Navigator.openWaze(to: stop.coordinate)
            } label: {
                Label("Waze", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
            }
            Button {
                Navigator.openAppleMaps(to: stop.coordinate, name: stop.customerName)
            } label: {
                Label("Apple Maps", systemImage: "map.fill")
            }
        } label: {
            Label(LocalizedStringKey("driver.action.navigate"), systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                .font(.subheadline.bold())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(.glassFill)
                .foregroundColor(.primary)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}
