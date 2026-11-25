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
            } else if auth.needsRetry {
                OfflineView()
            } else if let viewer = auth.viewer {
                if viewer.staffRole == .driver {
                    DriverHomeView()
                } else if viewer.isStaff || viewer.isDemo {
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

/// A saved sign-in exists but the server did not answer. Better to say so than to show the sign-in screen.
struct OfflineView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var busy = false

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.slash").font(.system(size: 44)).foregroundColor(.secondary).accessibilityHidden(true)
            Text("offline.title").font(.title3.bold())
            Text("offline.message").font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
            Button {
                busy = true
                Task { await auth.refresh(); busy = false }
            } label: {
                HStack { if busy { ProgressView().tint(Theme.onAccent) }; Text("common.retry").font(.headline) }
                    .foregroundStyle(Theme.onAccent)
                    .frame(minWidth: 160, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(busy)
            // Not stuck: leave this account (and a server address that stopped answering), or just call the shop.
            Button("auth.account.sign_out") { Task { _ = await auth.signOut() } }
                .font(.subheadline.bold())
                .frame(minHeight: 44)
            ContactBar().padding(.top, 8)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}
