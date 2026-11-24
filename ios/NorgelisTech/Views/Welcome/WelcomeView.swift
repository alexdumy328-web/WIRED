import SwiftUI
import MapKit

/// First screen for someone who is not signed in. It says what the shop does, then offers the three things
/// the app can do without knowing who you are: sign in, create an account, track a repair with its code.
struct WelcomeView: View {
    @State private var sheet: Sheet?

    private enum Sheet: String, Identifiable {
        case signIn, signUp, track, book
        var id: String { rawValue }
    }

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                // The main block is centred in the space above. The shop's contact details are pinned to the bottom.
                VStack(spacing: 28) {
                    Spacer(minLength: 0)
                    hero
                    actions
                    Spacer(minLength: 0)
                    ContactBar()
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 12)
                .frame(minHeight: proxy.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(Color(.systemBackground))
        .sheet(item: $sheet) { which in
            if which == .book {
                BookingFlowView()
            } else {
                NavigationStack {
                    Group {
                        switch which {
                        case .track: TrackView()
                        case .signUp: SignInView(startAtSignUp: true)
                        default: SignInView()
                        }
                    }
                    .navigationTitle(LocalizedStringKey(which == .track ? "customer.title" : (which == .signUp ? "auth.title.sign_up" : "auth.title.sign_in")))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button(LocalizedStringKey("common.close")) { sheet = nil }
                        }
                    }
                }
            }
        }
    }

    private var hero: some View {
        VStack(spacing: 14) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .shadow(color: Theme.shop.opacity(0.25), radius: 14, y: 6)
                .accessibilityHidden(true)
            Text("Norgelis Tech").font(.largeTitle.bold())
            Text("welcome.lead")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Signing in comes first. Booking and tracking work without an account, as on the website.
    private var actions: some View {
        VStack(spacing: 12) {
            Button { sheet = .signIn } label: {
                Text("welcome.sign_in").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 15)
                    .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundColor(.white)
            }
            Button { sheet = .signUp } label: {
                Text("welcome.create").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 15)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundColor(.primary)
            }
            Text("welcome.guest").font(.footnote).foregroundColor(.secondary).padding(.top, 10)
            HStack(spacing: 8) {
                Button { sheet = .book } label: {
                    Label("welcome.book", systemImage: "calendar.badge.plus").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
                }
                Button { sheet = .track } label: {
                    Label("welcome.track", systemImage: "magnifyingglass").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
                }
            }
        }
    }
}

/// Call, message and directions, the way the website's phone bar does it. Rows with no data stay out.
struct ContactBar: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                if let phone = Shop.phone {
                    button("phone.fill", "contact.call") { open(Shop.telURL(phone)) }
                    button("message.fill", "contact.whatsapp") { open(Shop.whatsappURL(phone)) }
                }
                button("map.fill", "contact.directions") {
                    let item = MKMapItem(placemark: MKPlacemark(coordinate: Shop.coordinate))
                    item.name = Shop.name
                    item.openInMaps()
                }
            }
            Text(Shop.address).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            if let url = Shop.feedbackURL {
                Link(destination: url) { Label("account.feedback", systemImage: "text.bubble").font(.footnote.bold()).frame(minHeight: 44) }
            }
        }
    }

    private func button(_ icon: String, _ title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.bold())
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func open(_ url: URL?) {
        if let url { openURL(url) }
    }
}
