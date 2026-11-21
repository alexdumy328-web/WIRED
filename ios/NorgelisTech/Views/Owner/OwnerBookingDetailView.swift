import SwiftUI

struct OwnerBookingDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var apiClient: APIClient
    @State var booking: Booking

    @State private var selectedStatus: BookingStatus
    @State private var statusNote: String = ""
    @State private var isUpdating: Bool = false

    init(booking: Booking) {
        _booking = State(initialValue: booking)
        _selectedStatus = State(initialValue: booking.status)
    }

    var body: some View {
        NavigationStack {
            Form {
                // Status Section
                Section(header: Text("Stare Reparație")) {
                    Picker("Status", selection: $selectedStatus) {
                        ForEach(BookingStatus.allCases) { status in
                            HStack {
                                Circle().fill(status.color).frame(width: 8, height: 8)
                                Text(LocalizedStringKey(status.titleKey))
                            }
                            .tag(status)
                        }
                    }

                    TextField("Notă status (opțional)", text: $statusNote)

                    Button {
                        updateStatus()
                    } label: {
                        HStack {
                            if isUpdating {
                                ProgressView()
                                    .padding(.trailing, 4)
                            }
                            Text(LocalizedStringKey("owner.booking.update_status"))
                        }
                    }
                    .disabled(isUpdating || selectedStatus == booking.status)
                }

                // Device & Issue Section
                Section(header: Text("Dispozitiv & Problemă")) {
                    LabeledContent("Aparat", value: booking.device?.displayName ?? "Nespecificat")
                    if let issue = booking.issue {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Defect raportat:")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(issue)
                                .font(.body)
                        }
                        .padding(.vertical, 2)
                    }
                }

                // Pickup details
                if let pickup = booking.pickup {
                    Section(header: Text("Preluare / Livrare la domiciliu")) {
                        LabeledContent("Adresă", value: pickup.address)
                        if let quote = pickup.quote, let total = quote.totalLei {
                            LabeledContent("Cost transport", value: "\(Int(total)) lei")
                        }
                        if pickup.urgent == true {
                            Label("Cursă urgentă solicitată", systemImage: "flame.fill")
                                .foregroundColor(.red)
                        }
                    }
                }

                // Contact Section
                if let contact = booking.contact {
                    Section(header: Text("Contact Client")) {
                        if let name = contact.name {
                            LabeledContent("Nume", value: name)
                        }
                        if let phone = contact.phone {
                            LabeledContent("Telefon", value: phone)
                        }
                        if let email = contact.email {
                            LabeledContent("Email", value: email)
                        }
                    }
                }
            }
            .navigationTitle(booking.code)
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

    private func updateStatus() {
        isUpdating = true
        Task {
            // Update local state
            if let idx = appState.bookings.firstIndex(where: { $0.code == booking.code }) {
                appState.bookings[idx].status = selectedStatus
            }
            booking.status = selectedStatus

            // Send to API
            _ = try? await apiClient.updateBookingStatus(
                code: booking.code,
                status: selectedStatus,
                note: statusNote.isEmpty ? nil : statusNote
            )

            await MainActor.run {
                isUpdating = false
            }
        }
    }
}
