import { ObjectId, type Collection, type Db, type Filter } from 'mongodb'
import { z } from 'zod'
import type { Booking, ContactChannel, Customer } from '../../src/types.ts'
import { COLLECTION_NAME, isDuplicateKeyError } from '../store.ts'

type CustomerDoc = Omit<Customer, 'id'> & { _id: ObjectId; phoneKey?: string; emailKey?: string }

const CHANNELS = ['phone', 'sms', 'whatsapp', 'email'] as const satisfies readonly ContactChannel[]

/**
 * One key per phone number however it was typed: "0721 123 456", "+40721123456" and
 * "0040 721-123-456" all give "40721123456". Numbers from abroad keep their own digits.
 */
export function phoneKey(phone: string | undefined): string | undefined {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 10 && digits.startsWith('0')) digits = `4${digits}`
  return digits.length >= 8 ? digits : undefined
}

export function emailKey(email: string | undefined): string | undefined {
  const key = email?.trim().toLowerCase()
  return key ? key : undefined
}

const phone = z.string().trim().regex(/^[+0-9 ()-]{8,20}$/, 'Phone must be 8-20 characters of digits, spaces, +, ( ) or -')
const text = (max: number) => z.string().trim().max(max)

const fields = {
  name: z.string().trim().min(2).max(80),
  phone: phone.optional().or(z.literal('')),
  email: z.email().max(160).optional().or(z.literal('')),
  company: z.object({ name: text(120).optional(), cui: text(20).optional(), regCom: text(30).optional() }).optional(),
  address: text(200).optional(),
  notes: text(2000).optional(),
  preferred: z.enum(CHANNELS),
}

/** A reachable customer: email when they want email, a phone number for everything else. */
function reachable(value: { phone?: string; email?: string; preferred?: ContactChannel }, ctx: z.RefinementCtx) {
  if (value.preferred === 'email' && !value.email) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Email is required when the customer prefers email' })
  if (value.preferred && value.preferred !== 'email' && !value.phone) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Phone is required for calls, SMS and WhatsApp' })
}

export const customerCreateSchema = z.object(fields).strict().superRefine(reachable)
export const customerPatchSchema = z.object(fields).partial().strict()
export type CustomerInput = z.infer<typeof customerCreateSchema>

function view(doc: CustomerDoc): Customer {
  const { _id, phoneKey: _p, emailKey: _e, ...rest } = doc
  return { ...rest, id: _id.toHexString() }
}

/** Drops empty strings so a cleared field is removed, not stored as "". */
function clean(input: Partial<CustomerInput>) {
  const set: Record<string, unknown> = {}
  const unset: Record<string, ''> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    if (key === 'company') {
      const company = Object.fromEntries(Object.entries(value as object).filter(([, v]) => typeof v === 'string' && v.length > 0))
      if (Object.keys(company).length) set.company = company
      else unset.company = ''
      continue
    }
    if (value === '') unset[key] = ''
    else set[key] = value
  }
  if ('phone' in input) {
    const key = phoneKey(input.phone || undefined)
    if (key) set.phoneKey = key
    else unset.phoneKey = ''
  }
  if ('email' in input) {
    const key = emailKey(input.email || undefined)
    if (key) set.emailKey = key
    else unset.emailKey = ''
  }
  return { set, unset }
}

export type CustomerSummary = Customer & { jobs: number; lastVisit?: string; open: number }

export class CustomerConflictError extends Error {
  readonly existingId: string
  constructor(existingId: string) {
    super('customer_exists')
    this.existingId = existingId
    this.name = 'CustomerConflictError'
  }
}

/**
 * The customer list. Built from online bookings and counter walk-ins, matched by phone number
 * first and email second, so the same person booking twice shows up once.
 */
export function createCustomers(db: Db) {
  const col: Collection<CustomerDoc> = db.collection<CustomerDoc>('customers')
  const bookings = db.collection<Booking>(COLLECTION_NAME)
  let indexed: Promise<unknown> | null = null
  const ensureIndexes = () => {
    indexed ??= Promise.all([
      col.createIndex({ phoneKey: 1 }, { name: 'phoneKey_unique', unique: true, partialFilterExpression: { phoneKey: { $type: 'string' } } }),
      col.createIndex({ emailKey: 1 }, { name: 'emailKey', partialFilterExpression: { emailKey: { $type: 'string' } } }),
      col.createIndex({ updatedAt: -1 }, { name: 'updatedAt' }),
      bookings.createIndex({ customerId: 1, slot: -1 }, { name: 'customerId', partialFilterExpression: { customerId: { $type: 'string' } } }),
    ]).catch(() => undefined)
    return indexed
  }

  async function byContact(contact: { phone?: string; email?: string }): Promise<CustomerDoc | null> {
    const p = phoneKey(contact.phone)
    if (p) {
      const found = await col.findOne({ phoneKey: p })
      if (found) return found
    }
    const e = emailKey(contact.email)
    // An email match only counts when that record has no other phone number on it, so two
    // people sharing a family address with different phones stay apart.
    if (e) return col.findOne({ emailKey: e, ...(p ? { phoneKey: { $exists: false } } : {}) }, { sort: { updatedAt: -1 } })
    return null
  }

  async function insert(input: CustomerInput): Promise<CustomerDoc> {
    const now = new Date().toISOString()
    const { set } = clean(input)
    const doc = { _id: new ObjectId(), ...set, createdAt: now, updatedAt: now } as CustomerDoc
    await col.insertOne(doc)
    return doc
  }

  /** The matching customer, or a new one. Fills in an email or phone the record was missing. */
  async function findOrCreate(contact: { name: string; phone?: string; email?: string }): Promise<CustomerDoc> {
    await ensureIndexes()
    const existing = await byContact(contact)
    if (existing) {
      const fill: Partial<CustomerInput> = {}
      if (!existing.email && contact.email) fill.email = contact.email
      if (!existing.phone && contact.phone && phoneKey(contact.phone)) fill.phone = contact.phone
      if (Object.keys(fill).length) {
        const { set } = clean(fill)
        try {
          await col.updateOne({ _id: existing._id }, { $set: { ...set, updatedAt: new Date().toISOString() } })
        } catch (error) {
          if (!isDuplicateKeyError(error)) throw error
        }
      }
      return existing
    }
    const preferred: ContactChannel = phoneKey(contact.phone) ? 'phone' : 'email'
    try {
      return await insert({ name: contact.name, phone: contact.phone || undefined, email: contact.email || undefined, preferred })
    } catch (error) {
      // Two bookings from the same new number at the same moment: the other one created it.
      if (isDuplicateKeyError(error)) {
        const again = await byContact(contact)
        if (again) return again
      }
      throw error
    }
  }

  async function linkBooking(code: string): Promise<string | null> {
    const booking = await bookings.findOne({ code })
    if (!booking) return null
    if (booking.customerId) return booking.customerId
    const customer = await findOrCreate(booking.contact)
    const id = customer._id.toHexString()
    await bookings.updateOne({ code, customerId: { $exists: false } }, { $set: { customerId: id } })
    return id
  }

  let backfilled: Promise<void> | null = null
  /** Links bookings made before the customer list existed. Runs once per process, in the background of the first list. */
  function backfill(): Promise<void> {
    backfilled ??= (async () => {
      const cursor = bookings.find({ customerId: { $exists: false } }, { projection: { code: 1 } }).sort({ createdAt: 1 }).limit(5000)
      for await (const doc of cursor) await linkBooking(doc.code)
    })().catch(() => {
      backfilled = null
    })
    return backfilled
  }

  async function summaries(docs: CustomerDoc[]): Promise<CustomerSummary[]> {
    if (!docs.length) return []
    const ids = docs.map((d) => d._id.toHexString())
    const rows = await bookings
      .aggregate<{ _id: string; jobs: number; lastVisit: string; open: number }>([
        { $match: { customerId: { $in: ids } } },
        {
          $group: {
            _id: '$customerId',
            jobs: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, 1] } },
            lastVisit: { $max: '$slot' },
            open: { $sum: { $cond: [{ $in: ['$status', ['received', 'diagnosis', 'waiting-parts', 'repairing', 'ready', 'unrepairable']] }, 1, 0] } },
          },
        },
      ])
      .toArray()
    const by = new Map(rows.map((r) => [r._id, r]))
    return docs.map((doc) => {
      const row = by.get(doc._id.toHexString())
      return { ...view(doc), jobs: row?.jobs ?? 0, open: row?.open ?? 0, ...(row?.lastVisit ? { lastVisit: row.lastVisit } : {}) }
    })
  }

  const idOf = (id: string) => (ObjectId.isValid(id) && id.length === 24 ? new ObjectId(id) : null)

  return {
    phoneKey,
    findOrCreate,
    linkBooking,
    backfill,

    async list(query: { q?: string; archived?: boolean; limit: number; skip: number }) {
      await ensureIndexes()
      await backfill()
      const filter: Filter<CustomerDoc> = query.archived ? { archived: true } : { archived: { $ne: true } }
      const q = query.q?.trim()
      if (q) {
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
        const digits = phoneKey(q) ?? (q.replace(/\D/g, '').length >= 3 ? q.replace(/\D/g, '') : undefined)
        filter.$or = [
          { name: rx },
          { email: rx },
          { 'company.name': rx },
          { 'company.cui': rx },
          ...(digits ? [{ phoneKey: { $regex: digits.replace(/^0/, '') } }] : []),
        ]
      }
      const [docs, total] = await Promise.all([col.find(filter).sort({ updatedAt: -1 }).skip(query.skip).limit(query.limit).toArray(), col.countDocuments(filter)])
      return { total, items: await summaries(docs) }
    },

    async get(id: string): Promise<Customer | null> {
      const _id = idOf(id)
      const doc = _id ? await col.findOne({ _id }) : null
      return doc ? view(doc) : null
    },

    /** A new customer typed in at the counter. Refuses a phone number that already has a record. */
    async create(input: CustomerInput): Promise<Customer> {
      await ensureIndexes()
      const existing = await byContact({ phone: input.phone || undefined })
      if (existing) throw new CustomerConflictError(existing._id.toHexString())
      try {
        return view(await insert(input))
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          const again = await byContact({ phone: input.phone || undefined })
          if (again) throw new CustomerConflictError(again._id.toHexString())
        }
        throw error
      }
    },

    /** Applies a partial edit; the merged record must still be reachable on its preferred channel. */
    async update(id: string, patch: Partial<CustomerInput>): Promise<{ ok: true; customer: Customer } | { ok: false; error: 'not_found' | 'invalid' | 'conflict'; message?: string }> {
      const _id = idOf(id)
      const before = _id ? await col.findOne({ _id }) : null
      if (!_id || !before) return { ok: false, error: 'not_found' }
      const merged = { phone: before.phone, email: before.email, preferred: before.preferred, ...patch }
      const check = z.object({ phone: z.string().optional(), email: z.string().optional(), preferred: z.enum(CHANNELS) }).superRefine(reachable).safeParse({
        phone: merged.phone || undefined,
        email: merged.email || undefined,
        preferred: merged.preferred,
      })
      if (!check.success) return { ok: false, error: 'invalid', message: check.error.issues[0]?.message }
      const { set, unset } = clean(patch)
      try {
        const after = await col.findOneAndUpdate(
          { _id },
          { $set: { ...set, updatedAt: new Date().toISOString() }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
          { returnDocument: 'after' },
        )
        if (!after) return { ok: false, error: 'not_found' }
        // Open jobs follow the new contact details, so mails and one-tap buttons reach the right place.
        const contact: Record<string, string> = {}
        if (set.name) contact['contact.name'] = after.name
        if ('phone' in patch && after.phone) contact['contact.phone'] = after.phone
        if ('email' in patch && after.email) contact['contact.email'] = after.email
        if (Object.keys(contact).length) {
          await bookings.updateMany({ customerId: id, status: { $nin: ['done', 'cancelled'] } }, { $set: contact })
        }
        return { ok: true, customer: view(after) }
      } catch (error) {
        if (isDuplicateKeyError(error)) return { ok: false, error: 'conflict', message: 'Another customer has this phone number' }
        throw error
      }
    },

    async archive(id: string, archived: boolean): Promise<Customer | null> {
      const _id = idOf(id)
      if (!_id) return null
      const after = await col.findOneAndUpdate({ _id }, archived ? { $set: { archived: true, updatedAt: new Date().toISOString() } } : { $unset: { archived: '' }, $set: { updatedAt: new Date().toISOString() } }, { returnDocument: 'after' })
      return after ? view(after) : null
    },

    /** Bumps the record so the most recently seen customers list first. */
    async touch(id: string) {
      const _id = idOf(id)
      if (_id) await col.updateOne({ _id }, { $set: { updatedAt: new Date().toISOString() } })
    },
  }
}

export type Customers = ReturnType<typeof createCustomers>
