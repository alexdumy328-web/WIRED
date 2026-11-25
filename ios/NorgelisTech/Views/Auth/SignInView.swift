import SwiftUI
import AuthenticationServices
import MapKit

/// Sign in, create an account, confirm an email or reset a password. Same steps as the website.
struct SignInView: View {
    @EnvironmentObject var auth: AuthStore
    @Environment(\.webAuthenticationSession) private var webAuthenticationSession

    private enum Method: Hashable { case code, password }
    private enum Step { case start, code, signUp, verify, forgot, reset }

    @State private var method: Method
    @State private var step: Step

    init(startAtSignUp: Bool = false) {
        _method = State(initialValue: startAtSignUp ? .password : .code)
        _step = State(initialValue: startAtSignUp ? .signUp : .start)
    }
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @State private var info: String?
    @State private var resendCooldown = 0
    @FocusState private var focus: Field?

    private enum Field { case email, password, name, code }

    private var mail: String { email.trimmingCharacters(in: .whitespaces).lowercased() }
    private var emailValid: Bool { mail.contains("@") && mail.contains(".") && mail.count >= 5 }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header

                if step == .start || step == .code {
                    Picker("auth.method.title", selection: $method) {
                        Text("auth.method.code").tag(Method.code)
                        Text("auth.method.password").tag(Method.password)
                    }
                    .pickerStyle(.segmented)
                    .disabled(step == .code)
                    .onChange(of: method) { _, _ in reset(.start) }
                }

                VStack(spacing: 12) {
                    fields
                    messages
                    primary
                    links
                }
                .padding(16)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 18))

                if auth.googleAvailable, step == .start || step == .signUp {
                    googleButton
                }

                if step == .signUp {
                    LegalLinksFooter()
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("")
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("common.done") { focus = nil }
            }
        }
        .task(id: resendCooldown) {
            guard resendCooldown > 0 else { return }
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            if !Task.isCancelled && resendCooldown > 0 { resendCooldown -= 1 }
        }
    }

    // MARK: - Pieces

    /// Google, through the system's sign-in browser (it can reuse a Google login from Safari).
    private var googleButton: some View {
        VStack(spacing: 10) {
            HStack {
                Rectangle().fill(Color.secondary.opacity(0.3)).frame(height: 1)
                Text("auth.or").font(.footnote).foregroundColor(.secondary)
                Rectangle().fill(Color.secondary.opacity(0.3)).frame(height: 1)
            }
            Button {
                Task { await google() }
            } label: {
                HStack(spacing: 10) {
                    Text(verbatim: "G").font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(LinearGradient(colors: [.blue, .red, .yellow, .green], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .accessibilityHidden(true)
                    Text("auth.google").font(.headline)
                }
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.bordered)
            .tint(.primary)
            .disabled(busy)
        }
    }

    private func google() async {
        guard let url = auth.googleStartURL else { return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let callback = try await webAuthenticationSession.authenticate(using: url, callbackURLScheme: "norgelis", preferredBrowserSession: .shared)
            try await auth.finishGoogle(callback: callback)
        } catch let problem as AuthProblem {
            error = problem == .other ? "auth.google_failed" : problem.key
        } catch ASWebAuthenticationSessionError.canceledLogin {
            // Closed the browser: nothing to say.
        } catch {
            self.error = "auth.google_failed"
        }
    }

    private var header: some View {
        VStack(spacing: 6) {
            Image(systemName: "person.crop.circle.badge.checkmark")
                .font(.system(size: 40))
                .foregroundColor(.accentColor)
                .accessibilityHidden(true)
            Text(LocalizedStringKey(title)).font(.title2.bold())
            Text(LocalizedStringKey(subtitle)).font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    private var title: String {
        switch step {
        case .signUp: return "auth.title.sign_up"
        case .verify: return "auth.title.verify"
        case .forgot: return "auth.title.forgot"
        case .reset: return "auth.title.reset"
        default: return "auth.title.sign_in"
        }
    }

    private var subtitle: String {
        switch step {
        case .signUp: return "auth.subtitle.sign_up"
        case .verify: return "auth.subtitle.verify"
        case .forgot: return "auth.subtitle.forgot"
        case .reset: return "auth.subtitle.reset"
        case .code: return "auth.subtitle.code"
        default: return "auth.subtitle.sign_in"
        }
    }

    private var showsPassword: Bool {
        (step == .start && method == .password) || step == .signUp || step == .reset
    }

    @ViewBuilder
    private var fields: some View {
        if step == .signUp {
            field("auth.field.name", text: $name, kind: .name, submit: .next) { focus = .email }
        }
        field("auth.field.email", text: $email, kind: .email, submit: showsPassword ? .next : .done) {
            if showsPassword { focus = .password } else { Task { await submit() } }
        }
        .disabled(step == .code || step == .verify || step == .reset)

        if step == .code || step == .verify || step == .reset {
            field("auth.field.code", text: $code, kind: .code, submit: step == .reset ? .next : .done) {
                if step == .reset { focus = .password } else { Task { await submit() } }
            }
        }
        if showsPassword {
            secure(step == .reset ? "auth.field.new_password" : "auth.field.password", text: $password)
        }
    }

    private enum Kind { case name, email, code }

    private func field(_ key: LocalizedStringKey, text: Binding<String>, kind: Kind, submit: SubmitLabel, onSubmit: @escaping () -> Void) -> some View {
        TextField(key, text: text)
            .textContentType(kind == .email ? .emailAddress : (kind == .code ? .oneTimeCode : .name))
            .keyboardType(kind == .email ? .emailAddress : (kind == .code ? .numberPad : .default))
            .textInputAutocapitalization(kind == .name ? .words : .never)
            .autocorrectionDisabled()
            .submitLabel(submit)
            .onSubmit(onSubmit)
            .focused($focus, equals: kind == .email ? .email : (kind == .code ? .code : .name))
            .padding(12)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func secure(_ key: LocalizedStringKey, text: Binding<String>) -> some View {
        SecureField(key, text: text)
            .textContentType(step == .signUp || step == .reset ? .newPassword : .password)
            .submitLabel(.done)
            .onSubmit { Task { await submit() } }
            .focused($focus, equals: .password)
            .padding(12)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private var messages: some View {
        if let info {
            Label(LocalizedStringKey(info), systemImage: "envelope.badge.fill")
                .font(.footnote).foregroundColor(Theme.ok).frame(maxWidth: .infinity, alignment: .leading)
        }
        if let error {
            Label(LocalizedStringKey(error), systemImage: "exclamationmark.triangle.fill")
                .font(.footnote).foregroundColor(Theme.danger).frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var primary: some View {
        Button {
            Task { await submit() }
        } label: {
            HStack {
                if busy { ProgressView().tint(Theme.onAccent).padding(.trailing, 4) }
                Text(LocalizedStringKey(primaryTitle)).font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(Color.accentColor)
            .foregroundColor(Theme.onAccent)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(busy)
    }

    private var primaryTitle: String {
        switch step {
        case .start: return method == .code ? "auth.button.send_code" : "auth.button.sign_in"
        case .code: return "auth.button.sign_in"
        case .signUp: return "auth.button.create"
        case .verify: return "auth.button.confirm"
        case .forgot: return "auth.button.send_code"
        case .reset: return "auth.button.reset"
        }
    }

    @ViewBuilder
    private var links: some View {
        VStack(spacing: 4) {
            switch step {
            case .start where method == .password:
                linkButton("auth.link.forgot") { openForgot() }
                linkButton("auth.link.create") { reset(.signUp) }
            case .signUp:
                linkButton("auth.link.have_account") { reset(.start) }
            case .forgot:
                linkButton("auth.link.back") { reset(.start) }
            case .code, .verify, .reset:
                Button {
                    Task { await resend() }
                } label: {
                    Group {
                        if resendCooldown > 0 {
                            Text("auth.link.resend_wait \(resendCooldown)")
                        } else {
                            Text("auth.link.resend")
                        }
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundColor(resendCooldown > 0 ? .secondary : .accentColor)
                .disabled(busy || resendCooldown > 0)
                linkButton("auth.link.back") { reset(.start) }
            default:
                linkButton("auth.link.create") { method = .password; reset(.signUp) }
            }
        }
        .font(.subheadline)
    }

    private func linkButton(_ key: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(key).frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundColor(.accentColor)
    }

    // MARK: - Logic

    private func openForgot() {
        if emailValid {
            Task { await requestReset() }
        } else {
            reset(.forgot)
        }
    }

    private func reset(_ next: Step, info: String? = nil, startCooldown: Bool = false) {
        step = next
        error = nil
        self.info = info
        code = ""
        if next == .start || next == .signUp || next == .forgot { password = "" }
        if startCooldown { resendCooldown = 45 }
        switch next {
        case .code, .verify, .reset: focus = .code
        case .forgot: focus = .email
        case .signUp: focus = .name
        case .start: focus = nil
        }
    }

    private func validate(email needEmail: Bool = true, password needPassword: Bool = false, code needCode: Bool = false, name needName: Bool = false) -> Bool {
        if needName, name.trimmingCharacters(in: .whitespaces).count < 2 { error = "auth.error.name"; focus = .name; return false }
        if needEmail, !emailValid { error = "auth.error.email"; focus = .email; return false }
        if needPassword, password.count < 10 { error = "auth.error.password_short"; focus = .password; return false }
        if needCode {
            let digits = code.trimmingCharacters(in: .whitespaces)
            if digits.count != 6 || Int(digits) == nil { error = "auth.error.code"; focus = .code; return false }
        }
        error = nil
        return true
    }

    /// Runs one request with the busy flag and error text.
    private func run(_ work: () async throws -> Void) async -> Bool {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await work()
            return true
        } catch let problem as AuthProblem {
            error = problem.key
        } catch {
            self.error = AuthProblem.other.key
        }
        return false
    }

    private func submit() async {
        let trimmedCode = code.trimmingCharacters(in: .whitespaces)
        switch step {
        case .start where method == .code:
            guard validate() else { return }
            if await run({ try await auth.sendSignInCode(email: mail) }) { reset(.code, info: "auth.info.code_sent", startCooldown: true) }
        case .code:
            guard validate(code: true) else { return }
            _ = await run { try await auth.signIn(email: mail, code: trimmedCode) }
        case .start:
            guard validate(password: true) else { return }
            busy = true
            error = nil
            do {
                try await auth.signIn(email: mail, password: password)
            } catch AuthProblem.unverified {
                // Same as the site: the server mails a code, we ask for it.
                reset(.verify, info: "auth.info.unverified", startCooldown: true)
            } catch let problem as AuthProblem {
                error = problem.key
            } catch {
                self.error = AuthProblem.other.key
            }
            busy = false
        case .signUp:
            guard validate(password: true, name: true) else { return }
            if await run({ try await auth.signUp(name: name.trimmingCharacters(in: .whitespaces), email: mail, password: password) }) {
                reset(.verify, info: "auth.info.confirm_sent", startCooldown: true)
            }
        case .verify:
            guard validate(code: true) else { return }
            _ = await run { try await auth.confirm(email: mail, code: trimmedCode) }
        case .forgot:
            await requestReset()
        case .reset:
            guard validate(password: true, code: true) else { return }
            if await run({ try await auth.reset(email: mail, code: trimmedCode, password: password) }) {
                method = .password
                reset(.start, info: "auth.info.reset_done")
            }
        }
    }

    private func requestReset() async {
        guard validate() else { return }
        if await run({ try await auth.requestReset(email: mail) }) { reset(.reset, info: "auth.info.reset_sent", startCooldown: true) }
    }

    private func resend() async {
        guard resendCooldown == 0, validate() else { return }
        switch step {
        case .code:
            if await run({ try await auth.sendSignInCode(email: mail) }) { info = "auth.info.code_sent"; resendCooldown = 45 }
        case .reset:
            if await run({ try await auth.requestReset(email: mail) }) { info = "auth.info.reset_sent"; resendCooldown = 45 }
        default:
            if await run({ try await auth.sendConfirmation(email: mail) }) { info = "auth.info.confirm_sent"; resendCooldown = 45 }
        }
    }
}

/// The account: who is signed in, how to reach the shop, legal links, sign out and account deletion.
/// Shown inside a navigation stack (a tab, or pushed from More).
struct AccountView: View {
    /// Re-draws when the server's feedback link and support email arrive.
    @ObservedObject private var remote = RemoteConfig.shared
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var ownerStore: OwnerStore
    @EnvironmentObject var apiClient: APIClient
    @EnvironmentObject var push: PushService
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var signOutWarning = false
    @State private var confirmDelete = false
    @State private var deleting = false
    @State private var deleteUnavailable = false
    @State private var deleteFailed = false
    @State private var deleteReauth = false
    @State private var deletePassword = ""
    @State private var staffAccount = false
    @State private var wrongPassword = false
    @State private var verifySheet = false

    var body: some View {
        List {
            if let viewer = auth.viewer {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 44))
                            .foregroundColor(.accentColor)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(viewer.name.isEmpty ? viewer.email : viewer.name).font(.headline)
                            Text(viewer.email).font(.subheadline).foregroundColor(.secondary)
                        }
                    }
                    if viewer.isStaff || viewer.isDemo {
                        LabeledContent("auth.account.role") { Text(LocalizedStringKey(roleKey(viewer.role))) }
                    }
                    LabeledContent("auth.account.email_status") {
                        Text(LocalizedStringKey(viewer.emailVerified ? "auth.account.confirmed" : "auth.account.not_confirmed"))
                            .foregroundColor(viewer.emailVerified ? Theme.ok : Theme.danger)
                    }
                    if !viewer.emailVerified {
                        Button {
                            verifySheet = true
                        } label: {
                            Label("auth.account.verify_now", systemImage: "envelope.badge.shield.half.filled")
                        }
                    }
                }

                if !viewer.isStaff {
                    Section { notificationsRow }
                }
            }

            Section("account.section.shop") {
                if let phone = Shop.phone, let url = Shop.telURL(phone) {
                    Button { openURL(url) } label: { Label("contact.call", systemImage: "phone.fill") }
                }
                if let phone = Shop.phone, let url = Shop.whatsappURL(phone) {
                    Button { openURL(url) } label: { Label("contact.whatsapp", systemImage: "message.fill") }
                }
                if let mail = Shop.supportEmail, let url = Shop.mailURL(to: mail, subject: "", body: "") {
                    Button { openURL(url) } label: { Label(mail, systemImage: "envelope.fill") }
                }
                Button { openDirections() } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("contact.directions")
                            Text(Shop.address).font(.caption).foregroundColor(.secondary)
                        }
                    } icon: {
                        Image(systemName: "map.fill")
                    }
                }
                Label("shop.hours", systemImage: "clock").font(.footnote).foregroundColor(.secondary)
                if let url = Shop.feedbackURL {
                    Link(destination: url) { Label("account.feedback", systemImage: "text.bubble.fill") }
                }
            }

            if Shop.privacyURL != nil || Shop.termsURL != nil {
                Section("account.section.legal") {
                    if let url = Shop.privacyURL { Link(destination: url) { Label("account.privacy", systemImage: "hand.raised.fill") } }
                    if let url = Shop.termsURL { Link(destination: url) { Label("account.terms", systemImage: "doc.text.fill") } }
                }
            }

            Section {
                LabeledContent("account.version") { Text(Self.versionText).foregroundColor(.secondary) }
            }

            if auth.isSignedIn {
                Section {
                    Button(role: .destructive) {
                        Task {
                            let ended = await auth.signOut()
                            if !ended { signOutWarning = true }
                        }
                    } label: {
                        Label("auth.account.sign_out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
                // Staff accounts are removed by the owner, and a demo account is shared, so neither deletes itself here.
                if auth.viewer?.isStaff == true || auth.viewer?.isDemo == true {
                    Section { Text("account.delete.staff_note").font(.footnote).foregroundColor(.secondary) }
                } else {
                    Section {
                        Button(role: .destructive) { confirmDelete = true } label: {
                            HStack {
                                Label("account.delete", systemImage: "trash")
                                if deleting { Spacer(); ProgressView() }
                            }
                        }
                        .disabled(deleting)
                    } footer: {
                        Text("account.delete.footer")
                    }
                }
            }
        }
        .navigationTitle(LocalizedStringKey("auth.account.title"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await push.refreshStatus() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await push.refreshStatus() } }
        }
        .sheet(isPresented: $verifySheet) {
            if let email = auth.viewer?.email {
                VerifyEmailSheet(email: email)
            }
        }
        .alert("auth.account.sign_out_warning_title", isPresented: $signOutWarning) {
            Button("common.ok", role: .cancel) {}
        } message: {
            Text("auth.account.sign_out_warning")
        }
        .confirmationDialog("account.delete.title", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("account.delete.confirm", role: .destructive) { Task { await delete() } }
            Button("common.cancel", role: .cancel) {}
        } message: {
            Text("account.delete.message")
        }
        .alert("account.delete.unavailable_title", isPresented: $deleteUnavailable) {
            if let mail = Shop.supportEmail,
               let url = Shop.mailURL(to: mail, subject: String(localized: "account.delete.email_subject"),
                                      body: String(format: String(localized: "account.delete.email_body %@"), auth.viewer?.email ?? "")) {
                Button("account.delete.email") { openURL(url) }
            }
            Button("common.close", role: .cancel) {}
        } message: {
            Text("account.delete.unavailable")
        }
        .alert("account.delete.failed", isPresented: $deleteFailed) {
            Button("common.ok", role: .cancel) {}
        }
        .alert("account.delete.wrong_password", isPresented: $wrongPassword) {
            Button("common.ok", role: .cancel) {}
        }
        .alert("account.delete.staff", isPresented: $staffAccount) {
            Button("common.ok", role: .cancel) {}
        } message: {
            Text("auth.error.staff_account")
        }
        // The server wants the password, or a sign-in from the last day. A code-only account has no password.
        .alert("account.delete.reauth_title", isPresented: $deleteReauth) {
            SecureField("auth.field.password", text: $deletePassword)
            Button("account.delete.confirm", role: .destructive) {
                let password = deletePassword
                deletePassword = ""
                Task { await delete(password: password) }
            }
            .disabled(deletePassword.trimmingCharacters(in: .whitespaces).isEmpty)
            Button("account.delete.signin_again") {
                deletePassword = ""
                Task { _ = await auth.signOut() }
            }
            Button("common.cancel", role: .cancel) { deletePassword = "" }
        } message: {
            Text("account.delete.reauth")
        }
    }

    @ViewBuilder
    private var notificationsRow: some View {
        switch push.authStatus {
        case .authorized, .provisional, .ephemeral:
            LabeledContent("account.notifications") {
                Text("account.notifications.on").foregroundColor(Theme.ok)
            }
        case .notDetermined:
            Button {
                Task { await push.requestAlerts() }
            } label: {
                HStack {
                    Label("account.notifications", systemImage: "bell.badge")
                    Spacer()
                    Text("alerts.prompt.enable").font(.subheadline).foregroundColor(.accentColor)
                }
            }
        default:
            Button {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            } label: {
                HStack {
                    Label("account.notifications", systemImage: "bell.slash")
                    Spacer()
                    Text("account.notifications.open_settings").font(.subheadline).foregroundColor(.secondary)
                }
            }
        }
    }

    private func openDirections() {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: Shop.coordinate))
        item.name = Shop.name
        item.openInMaps()
    }

    private func delete(password: String? = nil) async {
        deleting = true
        defer { deleting = false }
        do {
            try await auth.deleteAccount(password: password)
        } catch AuthProblem.unavailable {
            deleteUnavailable = true
        } catch AuthProblem.reauth {
            deleteReauth = true
        } catch AuthProblem.staffAccount {
            staffAccount = true
        } catch AuthProblem.invalidLogin {
            wrongPassword = true
        } catch {
            deleteFailed = true
        }
    }

    private static var versionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    private func roleKey(_ role: String) -> String {
        StaffRole(rawValue: role)?.titleKey ?? "auth.account.customer"
    }
}

/// In-place 6-digit email verification sheet launched from Account when email is unverified.
private struct VerifyEmailSheet: View {
    let email: String
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var busy = false
    @State private var info: String?
    @State private var error: String?
    @State private var cooldown = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("auth.subtitle.verify").font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
                Text(email).font(.subheadline.bold())
                TextField("auth.field.code", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .padding(12)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                if let info {
                    Label(LocalizedStringKey(info), systemImage: "envelope.badge.fill")
                        .font(.footnote).foregroundColor(Theme.ok).frame(maxWidth: .infinity, alignment: .leading)
                }
                if let error {
                    Label(LocalizedStringKey(error), systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundColor(Theme.danger).frame(maxWidth: .infinity, alignment: .leading)
                }
                Button {
                    Task { await verify() }
                } label: {
                    HStack {
                        if busy { ProgressView().tint(Theme.onAccent).padding(.trailing, 4) }
                        Text("auth.button.confirm").font(.headline)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Color.accentColor)
                    .foregroundColor(Theme.onAccent)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(busy)

                Button {
                    Task { await send() }
                } label: {
                    Group {
                        if cooldown > 0 { Text("auth.link.resend_wait \(cooldown)") }
                        else { Text("auth.link.resend") }
                    }
                    .frame(minHeight: 44)
                }
                .disabled(busy || cooldown > 0)
                Spacer()
            }
            .padding(20)
            .navigationTitle(LocalizedStringKey("auth.title.verify"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("common.close") { dismiss() }
                }
            }
            .task { await send() }
            .task(id: cooldown) {
                guard cooldown > 0 else { return }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if !Task.isCancelled && cooldown > 0 { cooldown -= 1 }
            }
        }
    }

    private func send() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await auth.sendConfirmation(email: email)
            info = "auth.info.confirm_sent"
            cooldown = 45
        } catch let problem as AuthProblem {
            error = problem.key
        } catch {
            self.error = AuthProblem.other.key
        }
    }

    private func verify() async {
        let digits = code.trimmingCharacters(in: .whitespaces)
        guard digits.count == 6, Int(digits) != nil else { error = "auth.error.code"; return }
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await auth.confirm(email: email, code: digits)
            dismiss()
        } catch let problem as AuthProblem {
            error = problem.key
        } catch {
            self.error = AuthProblem.other.key
        }
    }
}
