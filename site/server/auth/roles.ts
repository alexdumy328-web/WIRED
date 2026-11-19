export const ROLES = ['customer', 'owner', 'dev'] as const
export type Role = (typeof ROLES)[number]

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

const RANK: Record<Role, number> = { customer: 0, owner: 1, dev: 2 }

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
  return null
}

/** The stored role, raised to the bootstrap role when the env lists give a higher one. */
export function effectiveRole(stored: unknown, bootstrap: Role | null): Role {
  const base: Role = isRole(stored) ? stored : 'customer'
  return bootstrap && RANK[bootstrap] > RANK[base] ? bootstrap : base
}

/**
 * Who may set which role. Devs can set any role. Owners may promote customers to owner or
 * demote owners to customer, but can never grant dev or touch a dev account.
 */
export function canAssignRole(actor: Role, targetCurrent: Role, next: Role): boolean {
  if (actor === 'dev') return true
  if (actor === 'owner') return targetCurrent !== 'dev' && next !== 'dev'
  return false
}
