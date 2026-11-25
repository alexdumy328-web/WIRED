import { describe, expect, it } from 'vitest'
import { buildBookingIcs, canCancelBooking, normalizeBookingCode, whatsappUrl } from './booking-helpers'

describe('normalizeBookingCode', () => {
  it('prepends NT- for 4-character alphanumeric shorthand', () => {
    expect(normalizeBookingCode('4k7q')).toBe('NT-4K7Q')
    expect(normalizeBookingCode('  ab12 ')).toBe('NT-AB12')
  })

  it('keeps full codes and returns empty for blank input', () => {
    expect(normalizeBookingCode('nt-4k7q')).toBe('NT-4K7Q')
    expect(normalizeBookingCode('   ')).toBe('')
  })
})

describe('canCancelBooking', () => {
  it('allows cancelling received bookings more than 2 hours before the slot', () => {
    const now = new Date('2026-11-25T10:00:00Z')
    expect(canCancelBooking('received', '2026-11-25T12:01:00Z', now)).toBe(true)
    expect(canCancelBooking('received', '2026-11-25T11:59:00Z', now)).toBe(false)
    expect(canCancelBooking('diagnosis', '2026-11-25T15:00:00Z', now)).toBe(false)
  })
})

describe('whatsappUrl', () => {
  it('encodes prefilled message text cleanly', () => {
    expect(whatsappUrl('+40771332210', 'Bună, NT-4K7Q')).toBe('https://wa.me/40771332210?text=Bun%C4%83%2C%20NT-4K7Q')
  })
})

describe('buildBookingIcs', () => {
  it('creates a valid 1-hour VEVENT with escaped fields', () => {
    const ics = buildBookingIcs({
      code: 'NT-4K7Q',
      title: 'Norgelis Tech, NT-4K7Q',
      slot: '2026-11-26T08:00:00Z',
      location: 'Bd. Alexandru cel Bun 49, Iași',
      description: 'Code: NT-4K7Q\nBring charger',
    })
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20261126T080000Z')
    expect(ics).toContain('DTEND:20261126T090000Z')
    expect(ics).toContain('LOCATION:Bd. Alexandru cel Bun 49\\, Iași')
    expect(ics).toContain('DESCRIPTION:Code: NT-4K7Q\\nBring charger')
  })
})
