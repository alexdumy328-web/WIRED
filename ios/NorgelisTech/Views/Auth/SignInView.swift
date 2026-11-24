import SwiftUI

/// Sign in, create an account, confirm an email or reset a password. Same steps as the website.
struct SignInView: View {
    @EnvironmentObject var auth: AuthStore

    private enum Method: Hashable { case code, password }
    private enum Step { case start, code, signUp, verify, reset }

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
    @FocusState private var focus: Field?

    private enum Field { case email, password, name, code }

    private var mail: String { email.trimmingCharacters(in: .whitespaces).lowercased() }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header

                if step == .start || step == .code {
                    Picker("", selection: $method) {
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

                if auth.googleAvailable {
                    Text("auth.google_note")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    // MARK: - Pieces

    private var header: some View {
        VStack(spacing: 6) {
            Image(systemName: "person.crop.circle.badge.checkmark")
                .font(.system(size: 40))
                .foregroundColor(.accentColor)
            Text(LocalizedStringKey(title)).font(.title2.bold())
            Text(LocalizedStringKey(subtitle)).font(.subheadline).foregroundColor(.secondary).multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    private var title: String {
        switch step {
        case .signUp: return "auth.title.sign_up"
        case .verify: return "auth.title.verify"
        case .reset: return "auth.title.reset"
        default: return "auth.title.sign_in"
        }
    }

    private var subtitle: String {
        switch step {
        case .signUp: return "auth.subtitle.sign_up"
        case .verify: return "auth.subtitle.verify"
        case .reset: return "auth.subtitle.reset"
        case .code: return "auth.subtitle.code"
        default: return "auth.subtitle.sign_in"
        }
    }

    @ViewBuilder
    private var fields: some View {
        if step == .signUp {
            field("auth.field.name", text: $name, kind: .name)
        }
        field("auth.field.email", text: $email, kind: .email)
            .disabled(step == .code || step == .verify || step == .reset)
        if step == .code || step == .verify || step == .reset {
            field("auth.field.code", text: $code, kind: .code)
        }
        if (step == .start && method == .password) || step == .signUp || step == .reset {
            secure(step == .reset ? "auth.field.new_password" : "auth.field.password", text: $password)
        }
    }

    private enum Kind { case name, email, code }

    private func field(_ key: LocalizedStringKey, text: Binding<String>, kind: Kind) -> some View {
        TextField(key, text: text)
            .textContentType(kind == .email ? .emailAddress : (kind == .code ? .oneTimeCode : .name))
            .keyboardType(kind == .email ? .emailAddress : (kind == .code ? .numberPad : .default))
            .textInputAutocapitalization(kind == .name ? .words : .never)
            .autocorrectionDisabled()
            .focused($focus, equals: kind == .email ? .email : (kind == .code ? .code : .name))
            .padding(12)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func secure(_ key: LocalizedStringKey, text: Binding<String>) -> some View {
        SecureField(key, text: text)
            .textContentType(step == .signUp || step == .reset ? .newPassword : .password)
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
                if busy { ProgressView().tint(.white).padding(.trailing, 4) }
                Text(LocalizedStringKey(primaryTitle)).font(.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(Color.accentColor)
            .foregroundColor(.white)
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
        case .reset: return "auth.button.reset"
        }
    }

    @ViewBuilder
    private var links: some View {
        VStack(spacing: 8) {
            switch step {
            case .start where method == .password:
                linkButton("auth.link.forgot") { Task { await requestReset() } }
                linkButton("auth.link.create") { reset(.signUp) }
            case .signUp:
                linkButton("auth.link.have_account") { reset(.start) }
            case .code, .verify, .reset:
                linkButton("auth.link.resend") { Task { await resend() } }
                linkButton("auth.link.back") { reset(.start) }
            default:
                linkButton("auth.link.create") { method = .password; reset(.signUp) }
            }
        }
        .font(.subheadline)
    }

    private func linkButton(_ key: LocalizedStringKey, action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(key) }.buttonStyle(.plain).foregroundColor(.accentColor)
    }

    // MARK: - Logic

    private func reset(_ next: Step, info: String? = nil) {
        step = next
        error = nil
        self.info = info
        code = ""
        if next == .start || next == .signUp { password = "" }
    }

    private func validate(email needEmail: Bool = true, password needPassword: Bool = false, code needCode: Bool = false, name needName: Bool = false) -> Bool {
        if needName, name.trimmingCharacters(in: .whitespaces).count < 2 { error = "auth.error.name"; return false }
        if needEmail, !(mail.contains("@") && mail.contains(".") && mail.count >= 5) { error = "auth.error.email"; return false }
        if needPassword, password.count < 10 { error = "auth.error.password_short"; return false }
        if needCode {
            let digits = code.trimmingCharacters(in: .whitespaces)
            if digits.count != 6 || Int(digits) == nil { error = "auth.error.code"; return false }
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
            if await run({ try await auth.sendSignInCode(email: mail) }) { reset(.code, info: "auth.info.code_sent") }
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
                reset(.verify, info: "auth.info.unverified")
            } catch let problem as AuthProblem {
                error = problem.key
            } catch {
                self.error = AuthProblem.other.key
            }
            busy = false
        case .signUp:
            guard validate(password: true, name: true) else { return }
            if await run({ try await auth.signUp(name: name.trimmingCharacters(in: .whitespaces), email: mail, password: password) }) {
                reset(.verify, info: "auth.info.confirm_sent")
            }
        case .verify:
            guard validate(code: true) else { return }
            _ = await run { try await auth.confirm(email: mail, code: trimmedCode) }
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
        if await run({ try await auth.requestReset(email: mail) }) { reset(.reset, info: "auth.info.reset_sent") }
    }

    private func resend() async {
        guard validate() else { return }
        switch step {
        case .code:
            if await run({ try await auth.sendSignInCode(email: mail) }) { info = "auth.info.code_sent" }
        case .reset:
            if await run({ try await auth.requestReset(email: mail) }) { info = "auth.info.reset_sent" }
        default:
            if await run({ try await auth.sendConfirmation(email: mail) }) { info = "auth.info.confirm_sent" }
        }
    }
}

/// The account: who is signed in, how to reach the shop, legal links, sign out and account deletion.
/// Shown inside a navigation stack (a tab, or pushed from More).
struct AccountView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var ownerStore: OwnerStore
    @EnvironmentObject var apiClient: APIClient
    @Environment(\.openURL) private var openURL
    @State private var signOutWarning = false
    @State private var confirmDelete = false
    @State private var deleting = false
    @State private var deleteUnavailable = false
    @State private var deleteFailed = false

    var body: some View {
        List {
            if let viewer = auth.viewer {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill").font(.system(size: 44)).foregroundColor(.accentColor)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(viewer.name.isEmpty ? viewer.email : viewer.name).font(.headline)
                            Text(viewer.email).font(.subheadline).foregroundColor(.secondary)
                        }
                    }
                    LabeledContent("auth.account.role") { Text(LocalizedStringKey(roleKey(viewer.role))) }
                    LabeledContent("auth.account.email_status") {
                        Text(LocalizedStringKey(viewer.emailVerified ? "auth.account.confirmed" : "auth.account.not_confirmed"))
                            .foregroundColor(viewer.emailVerified ? Theme.ok : Theme.danger)
                    }
                }
            }

            Section("account.section.shop") {
                if let phone = Shop.phone {
                    Button { openURL(URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })")!) } label: { Label("contact.call", systemImage: "phone.fill") }
                }
                if let mail = Shop.supportEmail {
                    Button { openURL(URL(string: "mailto:\(mail)")!) } label: { Label(mail, systemImage: "envelope.fill") }
                }
                Label(Shop.address, systemImage: "mappin.and.ellipse").font(.subheadline).foregroundColor(.secondary)
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
                            ownerStore.changed()
                            if !ended { signOutWarning = true }
                        }
                    } label: {
                        Label("auth.account.sign_out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
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
        .navigationTitle(LocalizedStringKey("auth.account.title"))
        .navigationBarTitleDisplayMode(.inline)
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
            if let mail = Shop.supportEmail {
                Button("account.delete.email") {
                    let body = "Vă rog să ștergeți contul \(auth.viewer?.email ?? "")."
                    let query = "subject=Ștergere cont&body=\(body)".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
                    if let url = URL(string: "mailto:\(mail)?\(query)") { openURL(url) }
                }
            }
            Button("common.close", role: .cancel) {}
        } message: {
            Text("account.delete.unavailable")
        }
        .alert("account.delete.failed", isPresented: $deleteFailed) {
            Button("common.ok", role: .cancel) {}
        }
    }

    private func delete() async {
        deleting = true
        defer { deleting = false }
        do {
            try await auth.deleteAccount()
            ownerStore.changed()
        } catch AuthProblem.unavailable {
            deleteUnavailable = true
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
