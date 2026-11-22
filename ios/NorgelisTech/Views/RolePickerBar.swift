import SwiftUI

struct RolePickerBar: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var auth: AuthStore

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
                appState.isAccountPresented = true
            } label: {
                Image(systemName: auth.isSignedIn ? "person.crop.circle.fill" : "person.crop.circle")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(auth.isSignedIn ? Color.accentColor : Color.secondary)
                    .padding(6)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(Circle())
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text("auth.account.title"))

            Button {
                appState.isSettingsPresented = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(8)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(Circle())
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text("settings.title"))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }
}
