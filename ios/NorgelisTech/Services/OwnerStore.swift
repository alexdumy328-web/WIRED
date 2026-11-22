import SwiftUI

/// Shared state for the owner console: who is signed in, which repository to use, and a counter
/// that screens watch so they reload after something changes.
@MainActor
final class OwnerStore: ObservableObject {
    enum Tab: Hashable {
        case today, jobs, customers, schedule, more
    }

    /// Starts as the least access. Sample data raises it to dev, and a live sign-in sets what the server says.
    @Published var role: StaffRole = .technician
    @Published var tab: Tab = .today
    @Published var counts: StaffCounts?
    /// Bumped on every write. Screens reload when it changes.
    @Published private(set) var version = 0
    /// Set by the Today tab to open the Jobs tab on a filter.
    @Published var jobsFilter: String?
    @Published var lastError: String?

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
        if api.useMockData { role = .dev }
    }

    private var lastWasSample: Bool?

    var repo: OwnerRepository {
        api.useMockData ? MockOwnerRepository.shared : LiveOwnerRepository(api: api)
    }

    var isLive: Bool { !api.useMockData }

    /// Reads the role (live) or applies the dev's pick (sample data), then loads the counts.
    func bootstrap() async {
        lastError = nil
        if api.useMockData {
            if lastWasSample == false { role = .dev }
            await MockOwnerRepository.shared.setRole(role)
        } else {
            // Least access until the server answers.
            role = .technician
            do {
                role = try await repo.role()
            } catch is CancellationError {
                return
            } catch {
                lastError = error.localizedDescription
            }
        }
        // A newer bootstrap superseded this one. Leave its state alone.
        guard !Task.isCancelled else { return }
        lastWasSample = api.useMockData
        await refreshCounts()
        // Everything on screen came from the other source. Load it again.
        version += 1
    }

    func chooseMockRole(_ newRole: StaffRole) {
        role = newRole
        Task {
            await MockOwnerRepository.shared.setRole(newRole)
            changed()
        }
    }

    func refreshCounts() async {
        counts = try? await repo.counts()
    }

    /// Call after any write.
    func changed() {
        version += 1
        Task { await refreshCounts() }
    }

    func openJobs(status: String?) {
        jobsFilter = status
        tab = .jobs
    }
}
