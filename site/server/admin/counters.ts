import type { Db } from 'mongodb'

type CounterDoc = { _id: string; seq: number }

/**
 * Gap-free-in-practice running numbers (service sheets, warranties), one sequence per key and
 * year. The increment is a single atomic findOneAndUpdate, so two counters at the same moment
 * never get the same number.
 */
export function createCounters(db: Db) {
  const col = db.collection<CounterDoc>('counters')
  return {
    async next(kind: 'sheet' | 'warranty', year: number): Promise<number> {
      const doc = await col.findOneAndUpdate({ _id: `${kind}:${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })
      if (!doc) throw new Error('counter_failed')
      return doc.seq
    },
  }
}

export type Counters = ReturnType<typeof createCounters>
