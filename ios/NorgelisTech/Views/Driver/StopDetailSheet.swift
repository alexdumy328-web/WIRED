import SwiftUI

struct StopDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    let stop: PickupStop

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header card
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(stop.bookingCode)
                                .font(.caption.bold())
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Theme.pickup.opacity(0.15))
                                .foregroundColor(Theme.pickup)
                                .clipShape(Capsule())

                            if stop.isUrgent {
                                Text(LocalizedStringKey("common.urgent"))
                                    .font(.caption.bold())
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Theme.danger)
                                    .foregroundColor(.white)
                                    .clipShape(Capsule())
                            }

                            Spacer()

                            Text(stop.scheduledTime)
                                .font(.headline)
                        }

                        Text(stop.customerName)
                            .font(.title2.bold())
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    // Address details
                    VStack(alignment: .leading, spacing: 10) {
                        Label(LocalizedStringKey("driver.stop.address"), systemImage: "mappin.circle.fill")
                            .font(.headline)
                        Text(stop.address)
                            .font(.body)
                            .foregroundColor(.secondary)

                        Text("Tip cursă: \(String(localized: String.LocalizationValue(stop.type.localizedTitleKey)))")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                    // Contact actions
                    HStack(spacing: 12) {
                        Button {
                            callPhone(stop.customerPhone)
                        } label: {
                            Label("Sună (\(stop.customerPhone))", systemImage: "phone.fill")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Theme.ok)
                                .foregroundColor(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }

                    // Start Action
                    if !stop.isCompleted {
                        Button {
                            appState.startTripToStop(stop)
                            dismiss()
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
                }
                .padding()
            }
            .navigationTitle("Detalii Oprire")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(LocalizedStringKey("common.close")) {
                        dismiss()
                    }
                }
            }
        }
    }

    private func callPhone(_ phone: String) {
        let clean = phone.replacingOccurrences(of: " ", with: "")
        if let url = URL(string: "tel://\(clean)") {
            #if os(iOS)
            UIApplication.shared.open(url)
            #endif
        }
    }
}
