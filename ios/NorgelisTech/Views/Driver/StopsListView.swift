import SwiftUI

struct StopsListView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState
    @Binding var selectedStop: PickupStop?

    var body: some View {
        NavigationStack {
            List {
                Section(header: Text(LocalizedStringKey("driver.stops.title"))) {
                    ForEach(appState.stops) { stop in
                        HStack(spacing: 14) {
                            Image(systemName: stop.isCompleted ? "checkmark.circle.fill" : (stop.isUrgent ? "exclamationmark.triangle.fill" : "circle"))
                                .font(.system(size: 20))
                                .foregroundColor(stop.isCompleted ? .green : (stop.isUrgent ? .red : .secondary))

                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(stop.customerName)
                                        .font(.headline)
                                    Spacer()
                                    Text(stop.scheduledTime)
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }

                                Text(stop.address)
                                    .font(.footnote)
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)

                                HStack(spacing: 6) {
                                    Text(stop.bookingCode)
                                        .font(.caption2.bold())
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.blue.opacity(0.15))
                                        .foregroundColor(.blue)
                                        .clipShape(Capsule())

                                    Text(LocalizedStringKey(stop.type.localizedTitleKey))
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedStop = stop
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(LocalizedStringKey("driver.stops.title"))
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
}
