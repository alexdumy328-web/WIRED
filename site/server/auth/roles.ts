/**
 * In order of rank. A driver only sees pickups and deliveries and shares the van's position. A technician works on
 * devices; an owner also runs the money and settings; dev can do everything.
 */
export const ROLES = ['customer', 'driver', 'technician', 'owner', 'dev'] as const
export type Role = (typeof ROLES)[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

const RANK: Record<Role, number> = { customer: 0, driver: 1, technician: 2, owner: 3, dev: 4 }

/** Roles that may drive: see today's pickups and deliveries and share the van's position. */
export const DRIVER_ROLES = ['driver', 'technician', 'owner', 'dev'] as const satisfies readonly Role[]

/** Roles that work in the /admin dashboard (a driver does not). */
export const STAFF_ROLES = ['technician', 'owner', 'dev'] as const satisfies readonly Role[]
/** Roles that see money, settings and stats, and may archive or void. */
export const MANAGER_ROLES = ['owner', 'dev'] as const satisfies readonly Role[]

export function isManager(role: Role): boolean {
  return RANK[role] >= RANK.owner
}

function emailList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Role implied by OWNER_EMAILS / DEV_EMAILS. Only a verified address counts, so nobody gains a
 * role by signing up with an address they do not own.
 */
export function bootstrapRole(env: Record<string, string | undefined>, email: string, emailVerified: boolean): Role | null {
  if (!emailVerified) return null
  const wanted = email.trim().toLowerCase()
  if (emailList(env.DEV_EMAILS).has(wanted)) return 'dev'
  if (emailList(env.OWNER_EMAILS).has(wanted)) return 'owner'
  if (emailList(env.DRIVER_EMAILS).has(wanted)) return 'driver'
  return null
}

/** The stored role, raised to the bootstrap role when the env lists give a higher one. */
export function effectiveRole(stored: unknown, bootstrap: Role | null): Role {
  const base: Role = isRole(stored) ? stored : 'customer'
  return bootstrap && RANK[bootstrap] > RANK[base] ? bootstrap : base
}

/**
 * Who may set which role. Devs can set any role. Owners may move accounts between customer,
 * technician and owner, but can never grant dev or touch a dev account.
 */
export function canAssignRole(actor: Role, targetCurrent: Role, next: Role): boolean {
  if (actor === 'dev') return true
  if (actor === 'owner') return targetCurrent !== 'dev' && next !== 'dev'
  return false
}
