import SwiftUI

struct RolePickerBar: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack(spacing: 12) {
            Picker(String(localized: "role.picker.title"), selection: $appState.selectedRole) {
                ForEach(UserRole.allCases) { role in
                    Label(LocalizedStringKey(role.titleKey), systemImage: role.iconName)
                        .tag(role)
                }
            }
            .pickerStyle(.segmented)

            Button {
                appState.isSettingsPresented = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(8)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }
}
