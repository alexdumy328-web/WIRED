import SwiftUI

struct CustomerRootView: View {
    @EnvironmentObject var appState: AppState
    @State private var inputCode: String = APIClient.shared.useMockData ? "NT-4K7Q" : ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Search Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text("customer.lookup.title")
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
                                    .frame(minWidth: 44, minHeight: 44)
                                    .background(Color.accentColor)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .accessibilityLabel(Text("customer.search.button"))
                        }
                    }
                    .padding(16)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    if appState.customerLookupBusy {
                        ProgressView().padding()
                    }
                    if let message = appState.customerLookupError {
                        Label(message, systemImage: "magnifyingglass")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

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
                                Label("customer.pickup.scheduled", systemImage: "clock.badge.checkmark.fill")
                                    .font(.subheadline.bold())
                                    .foregroundColor(Theme.pickup)
                                Text(LocalizedStringKey("customer.driver.waiting"))
                                    .font(.footnote)
                                    .foregroundColor(.secondary)
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.pickup.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }

                        // Booking summary card
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                Text(booking.code)
                                    .font(.title3.bold())

                                Spacer()

                                StatusBadge(status: booking.status)
                            }

                            Divider()

                            VStack(alignment: .leading, spacing: 8) {
                                LabeledContent("console.job.device_label", value: booking.device?.displayName ?? String(localized: "console.job.no_device"))
                                HStack {
                                    Text(LocalizedStringKey("booking.kind.label"))
                                    Spacer()
                                    KindChip(kind: booking.kind)
                                }
                                if let estimate = booking.estimate {
                                    PriceRow(estimate: estimate)
                                }
                                if let slot = booking.slot {
                                    LabeledContent("customer.booking.date", value: formatDate(slot))
                                }
                                if let issue = booking.issue {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("customer.booking.issue")
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
                                    Label("customer.pickup.address", systemImage: "mappin.circle.fill")
                                        .font(.subheadline.bold())
                                    Text(pickup.address)
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)

                                    if let quote = pickup.quote, let total = quote.totalLei {
                                        Text("customer.pickup.cost \(Int(total))")
                                            .font(.caption.bold())
                                            .foregroundColor(Theme.pickup)
                                    }
                                }
                            }
                        }
                        .padding(16)
                        .background(Color(.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    } else if !appState.customerLookupBusy && appState.customerLookupError == nil {
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
        // The API sends fractional seconds ("...T10:30:00.000Z"); older values may not.
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        guard let date = withFraction.date(from: isoString) ?? plain.date(from: isoString) else {
            return isoString
        }
        let out = DateFormatter()
        out.dateStyle = .medium
        out.timeStyle = .short
        out.timeZone = TimeZone(identifier: "Europe/Bucharest")
        out.locale = Locale.current
        return out.string(from: date)
    }
}
