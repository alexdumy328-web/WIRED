import SwiftUI

struct CustomerRootView: View {
    @EnvironmentObject var appState: AppState
    @State private var inputCode: String = "NT-4K7Q"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Search Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Verifică starea reparației")
                            .font(.headline)

                        HStack {
                            TextField(LocalizedStringKey("customer.lookup.placeholder"), text: $inputCode)
                                .autocorrectionDisabled()
                                #if os(iOS)
                                .textInputAutocapitalization(.characters)
                                #endif
                                .padding(12)
                                .background(Color(.systemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 10))

                            Button {
                                appState.searchBooking(code: inputCode)
                            } label: {
                                Image(systemName: "magnifyingglass")
                                    .font(.headline)
                                    .foregroundColor(.white)
                                    .padding(12)
                                    .background(Color.accentColor)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }
                    }
                    .padding(16)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    // Active booking result
                    if let booking = appState.currentCustomerBooking {
                        // Live Tracking Card (if driver is on the way to this booking)
                        if appState.isDriverEnRoute,
                           let stop = appState.currentEnRouteStop,
                           stop.bookingCode == booking.code {
                            LiveTrackingView(booking: booking, stop: stop)
                        } else if booking.hasPickup {
                            // Driver not en route yet info
                            VStack(alignment: .leading, spacing: 8) {
                                Label("Preluare / Livrare programată", systemImage: "clock.badge.checkmark.fill")
                                    .font(.subheadline.bold())
                                    .foregroundColor(.orange)
                                Text(LocalizedStringKey("customer.driver.waiting"))
                                    .font(.footnote)
                                    .foregroundColor(.secondary)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.orange.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        // Booking summary card
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                Text(booking.code)
                                    .font(.title3.bold())

                                Spacer()

                                HStack(spacing: 4) {
                                    Image(systemName: booking.status.iconName)
                                    Text(LocalizedStringKey(booking.status.titleKey))
                                }
                                .font(.subheadline.bold())
                                .foregroundColor(booking.status.color)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(booking.status.color.opacity(0.12))
                                .clipShape(Capsule())
                            }

                            Divider()

                            VStack(alignment: .leading, spacing: 8) {
                                LabeledContent("Dispozitiv", value: booking.device?.displayName ?? "Nespecificat")
                                if let slot = booking.slot {
                                    LabeledContent("Data programării", value: formatDate(slot))
                                }
                                if let issue = booking.issue {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("Problemă reclamată:")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                        Text(issue)
                                            .font(.body)
                                    }
                                }
                            }

                            if let pickup = booking.pickup {
                                Divider()
                                VStack(alignment: .leading, spacing: 6) {
                                    Label("Adresă preluare / livrare", systemImage: "mappin.circle.fill")
                                        .font(.subheadline.bold())
                                    Text(pickup.address)
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)

                                    if let quote = pickup.quote, let total = quote.totalLei {
                                        Text("Cost transport: \(Int(total)) lei")
                                            .font(.caption.bold())
                                            .foregroundColor(.blue)
                                    }
                                }
                            }
                        }
                        .padding(16)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    } else {
                        Text(LocalizedStringKey("customer.no_active_bookings"))
                            .foregroundColor(.secondary)
                            .padding()
                    }
                }
                .padding(16)
            }
            .navigationTitle(LocalizedStringKey("customer.title"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
    }

    private func formatDate(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: isoString) {
            let outFormatter = DateFormatter()
            outFormatter.dateStyle = .medium
            outFormatter.timeStyle = .short
            outFormatter.locale = Locale(identifier: "ro_RO")
            return outFormatter.string(from: date)
        }
        return isoString
    }
}
