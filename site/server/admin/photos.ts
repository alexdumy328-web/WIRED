import { Binary, ObjectId, type Collection, type Db } from 'mongodb'

type PhotoDoc = { _id: ObjectId; bookingCode: string; data: Binary; size: number; createdAt: string; by: string }

export const MAX_PHOTOS = 6
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024

/** JPEG files start with FF D8 FF. The browser re-encodes every photo to JPEG before upload. */
export function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

/**
 * Intake photos: the state of the device when it came in. Small JPEGs stored in Mongo next to the
 * booking, so there is no second storage service to run or pay for.
 */
export function createPhotos(db: Db) {
  const col: Collection<PhotoDoc> = db.collection<PhotoDoc>('photos')
  let indexed: Promise<unknown> | null = null
  const ensureIndexes = () => {
    indexed ??= col.createIndex({ bookingCode: 1 }, { name: 'bookingCode' }).catch(() => undefined)
    return indexed
  }
  const idOf = (id: string) => (ObjectId.isValid(id) && id.length === 24 ? new ObjectId(id) : null)

  return {
    async add(bookingCode: string, data: Buffer, by: string): Promise<string> {
      await ensureIndexes()
      const doc: PhotoDoc = { _id: new ObjectId(), bookingCode, data: new Binary(data), size: data.length, createdAt: new Date().toISOString(), by }
      await col.insertOne(doc)
      return doc._id.toHexString()
    },
    async get(id: string): Promise<{ bookingCode: string; data: Buffer } | null> {
      const _id = idOf(id)
      const doc = _id ? await col.findOne({ _id }) : null
      return doc ? { bookingCode: doc.bookingCode, data: Buffer.from(doc.data.buffer) } : null
    },
    async remove(id: string): Promise<{ bookingCode: string } | null> {
      const _id = idOf(id)
      if (!_id) return null
      const doc = await col.findOneAndDelete({ _id }, { projection: { bookingCode: 1 } })
      return doc ? { bookingCode: doc.bookingCode } : null
    },
    async count(bookingCode: string): Promise<number> {
      return col.countDocuments({ bookingCode })
    },
  }
}

export type Photos = ReturnType<typeof createPhotos>
