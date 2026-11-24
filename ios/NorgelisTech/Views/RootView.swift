import SwiftUI

/// Decides what the person sees. Nobody picks a role: the server's answer for the signed-in account does.
///
/// - Not signed in: the welcome screen (sign in, create an account, or track a repair with a code).
/// - Customer account: their own repairs.
/// - Staff account (technician, owner, dev): the workshop console with the driver map.
struct RootView: View {
    @EnvironmentObject var auth: AuthStore

    var body: some View {
        Group {
            if !auth.loaded {
                SplashView()
            } else if let viewer = auth.viewer {
                if viewer.isStaff {
                    StaffHomeView()
                } else {
                    CustomerHomeView()
                }
            } else {
                WelcomeView()
            }
        }
        .animation(.easeInOut(duration: 0.2), value: auth.viewer?.id)
    }
}

/// Shown for the moment it takes to ask the server who is signed in.
struct SplashView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .accessibilityHidden(true)
            ProgressView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}
