import SwiftUI

struct OwnerRootView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedFilter: BookingFilter = .all
    @State private var searchText: String = ""
    @State private var selectedBooking: Booking?

    enum BookingFilter: String, CaseIterable, Identifiable {
        case all = "Toate"
        case active = "În lucru"
        case pickups = "Preluări"
        case ready = "Gata"

        var id: String { rawValue }
    }

    var filteredBookings: [Booking] {
        appState.bookings.filter { b in
            let matchesFilter: Bool
            switch selectedFilter {
            case .all:
                matchesFilter = true
            case .active:
                matchesFilter = b.status == .received || b.status == .diagnosis || b.status == .waitingParts || b.status == .repairing
            case .pickups:
                matchesFilter = b.hasPickup
            case .ready:
                matchesFilter = b.status == .ready
            }

            if searchText.isEmpty {
                return matchesFilter
            } else {
                let query = searchText.lowercased()
                let codeMatch = b.code.lowercased().contains(query)
                let nameMatch = b.contact?.name?.lowercased().contains(query) ?? false
                let deviceMatch = b.device?.displayName.lowercased().contains(query) ?? false
                return matchesFilter && (codeMatch || nameMatch || deviceMatch)
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Header Stats
                    statsRow

                    // Driver Live Radar Card
                    DriverRadarCard()

                    // Filter Pills
                    Picker("Filtru", selection: $selectedFilter) {
                        ForEach(BookingFilter.allCases) { filter in
                            Text(filter.rawValue).tag(filter)
                        }
                    }
                    .pickerStyle(.segmented)

                    // Bookings List
                    VStack(spacing: 12) {
                        ForEach(filteredBookings) { booking in
                            bookingCard(booking)
                                .onTapGesture {
                                    selectedBooking = booking
                                }
                        }
                    }
                }
                .padding(16)
            }
            .searchable(text: $searchText, prompt: "Caută după cod, client, aparat...")
            .navigationTitle(LocalizedStringKey("owner.title"))
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .sheet(item: $selectedBooking) { booking in
                OwnerBookingDetailView(booking: booking)
            }
        }
    }

    // MARK: - Subviews

    private var statsRow: some View {
        HStack(spacing: 12) {
            statBox(
                title: "Reparații active",
                value: "\(appState.bookings.filter { $0.status != .done && $0.status != .cancelled }.count)",
                icon: "wrench.and.screwdriver.fill",
                color: .blue
            )

            statBox(
                title: "Preluări astăzi",
                value: "\(appState.stops.count)",
                icon: "car.fill",
                color: .orange
            )
        }
    }

    private func statBox(title: String, value: String, icon: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundColor(color)
                Spacer()
                Text(value)
                    .font(.title2.bold())
            }
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func bookingCard(_ booking: Booking) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(booking.code)
                    .font(.subheadline.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.blue.opacity(0.12))
                    .foregroundColor(.blue)
                    .clipShape(Capsule())

                Spacer()

                HStack(spacing: 4) {
                    Image(systemName: booking.status.iconName)
                    Text(LocalizedStringKey(booking.status.titleKey))
                }
                .font(.caption.bold())
                .foregroundColor(booking.status.color)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(booking.device?.displayName ?? "Dispozitiv")
                    .font(.headline)
                if let issue = booking.issue {
                    Text(issue)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
            }

            if let pickup = booking.pickup {
                HStack(spacing: 4) {
                    Image(systemName: "car.fill")
                        .font(.caption)
                        .foregroundColor(.orange)
                    Text(pickup.address)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
