import SwiftUI
import MapKit

/// First screen for someone who is not signed in. It says what the shop does, then offers the three things
/// the app can do without knowing who you are: sign in, create an account, track a repair with its code.
struct WelcomeView: View {
    @EnvironmentObject var push: PushService
    @EnvironmentObject var appState: AppState
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
        // A booking link from an email opens the lookup with that code, no account needed.
        .onReceive(push.$openCode.compactMap { $0 }) { code in
            appState.searchBooking(code: code)
            sheet = .track
            push.openCode = nil
        }
        .sheet(item: $sheet) { which in
            if which == .book {
                BookingFlowView { code in
                    appState.searchBooking(code: code)
                    sheet = .track
                }
            } else {
                NavigationStack {
                    Group {
                        switch which {
                        case .track:
                            TrackView()
                                .navigationTitle(LocalizedStringKey("customer.title"))
                        case .signUp:
                            SignInView(startAtSignUp: true)
                        default:
                            SignInView()
                        }
                    }
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
                    .foregroundColor(Theme.onAccent)
            }
            Button { sheet = .signUp } label: {
                Text("welcome.create").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 15)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .foregroundColor(.primary)
            }
            Text("welcome.guest").font(.footnote).foregroundColor(.secondary).padding(.top, 10)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { guestButtons }
                VStack(spacing: 8) { guestButtons }
            }
        }
    }

    @ViewBuilder
    private var guestButtons: some View {
        Button { sheet = .book } label: {
            Label("welcome.book", systemImage: "calendar.badge.plus").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
        }
        Button { sheet = .track } label: {
            Label("welcome.track", systemImage: "magnifyingglass").font(.subheadline.bold()).frame(maxWidth: .infinity, minHeight: 44)
        }
    }
}

/// Call, message and directions, the way the website's phone bar does it. Rows with no data stay out.
struct ContactBar: View {
    @Environment(\.openURL) private var openURL
    /// Re-draws when the server's feedback link arrives.
    @ObservedObject private var remote = RemoteConfig.shared

    var body: some View {
        VStack(spacing: 10) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { contactButtons }
                VStack(spacing: 8) { contactButtons }
            }
            Text(Shop.address).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            if let url = Shop.feedbackURL {
                Link(destination: url) { Label("account.feedback", systemImage: "text.bubble").font(.footnote.bold()).frame(minHeight: 44) }
            }
            LegalLinksFooter()
        }
    }

    @ViewBuilder
    private var contactButtons: some View {
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

    private func button(_ icon: String, _ title: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.bold())
                .lineLimit(1)
                .padding(.horizontal, 10)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func open(_ url: URL?) {
        if let url { openURL(url) }
    }
}

/// Subtle Privacy & Terms footer shown on Welcome and Sign-up screens.
struct LegalLinksFooter: View {
    var body: some View {
        if Shop.privacyURL != nil || Shop.termsURL != nil {
            HStack(spacing: 12) {
                if let url = Shop.privacyURL {
                    Link("account.privacy", destination: url).frame(minHeight: 36)
                }
                if Shop.privacyURL != nil && Shop.termsURL != nil {
                    Text("·").foregroundColor(.secondary).accessibilityHidden(true)
                }
                if let url = Shop.termsURL {
                    Link("account.terms", destination: url).frame(minHeight: 36)
                }
            }
            .font(.caption)
            .foregroundColor(.secondary)
        }
    }
}
