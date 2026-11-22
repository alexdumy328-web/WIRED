import SwiftUI

struct RootView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            // Development Role Switcher Bar
            if appState.isDevRolePickerVisible {
                RolePickerBar()
                    .zIndex(10)
            }

            // Role View Switcher
            Group {
                switch appState.selectedRole {
                case .driver:
                    DriverRootView()
                case .owner:
                    OwnerConsoleView()
                case .customer:
                    CustomerRootView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .sheet(isPresented: $appState.isSettingsPresented) {
            DevSettingsSheet()
        }
    }
}
