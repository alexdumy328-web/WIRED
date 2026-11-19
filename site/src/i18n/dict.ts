/**
 * Every UI string on the site. ro.ts and en.ts both export a `Dict`.
 * Catalog jobs and reviews carry their own bilingual text (see src/data).
 * Placeholders in strings use {name} syntax and are filled by `fmt()` in src/i18n/index.tsx.
 */
export type Dict = {
  meta: { title: string; description: string }
  nav: {
    services: string
    mobile: string
    process: string
    workshop: string
    reviews: string
    faq: string
    book: string // short CTA in the header
    track: string // "track a repair"
    themeLight: string
    themeDark: string
    themeSystem: string
    language: string
    openMenu: string
    closeMenu: string
  }
  status: {
    openNow: string // "Open now, until {time}"
    closedNow: string // "Closed, opens {day} at {time}"
  }
  hero: {
    title: string // 4-8 words, the headline
    lead: string // 1-2 sentences
    ctaBook: string
    ctaPrices: string
    scrollHint: string
  }
  /** Captions shown next to each 3D camera stop while scrolling the hero tour. */
  tour: {
    overview: { title: string; body: string }
    pcbWall: { title: string; body: string }
    bench: { title: string; body: string }
    counter: { title: string; body: string }
    door: { title: string; body: string }
  }
  /** Short labels (1-3 words) on clickable hotspots inside the 3D shop. */
  hotspots: {
    pcbWall: string // the wall of repaired boards
    bench: string // board-level / micro-soldering bench
    laptop: string // laptops, PCs, IT
    coffee: string // espresso machines and appliances
    counter: string // reception, booking
    door: string // car electrics at your car
  }
  services: {
    title: string
    lead: string
    categories: Record<'laptop' | 'pc' | 'board' | 'coffee' | 'appliance' | 'it', { name: string; blurb: string }>
    from: string // "from {price} lei"
    fixed: string // "{price} lei"
    range: string // "{from}–{to} lei"
    eta: string // "ready in {eta}"
    afterDiagnosis: string // "final price after diagnosis"
    bookThis: string
  }
  mobile: {
    title: string
    lead: string
    area: string // where the van goes
    travelFee: string // e.g. "Travel inside the city is free; outside, {price} lei/km"
    points: string[] // 3-5 concrete things done at the car
    bookThis: string
  }
  process: {
    title: string
    steps: { title: string; body: string }[] // exactly 5, real sequence
  }
  workshop: {
    title: string
    lead: string
    photos: { lab: string; entrance: string; pcbWall: string } // alt texts / captions
  }
  eta: {
    title: string
    lead: string
    chartTitle: string // typical turnaround per category
    chartUnit: string // "days" / "zile"
    queueNow: string // "{n} devices on the bench right now"
    hours: string // "{n} h"
    days: string // "{n} days"
    sameDay: string
  }
  track: {
    title: string
    lead: string
    placeholder: string // e.g. "NT-4K7Q"
    button: string
    notFound: string
    error: string
    statuses: Record<'received' | 'diagnosis' | 'waiting-parts' | 'repairing' | 'ready' | 'done', string>
    updated: string // "Updated {when}"
  }
  reviews: {
    title: string
    summary: string // "{rating} out of 5 from {count} reviews"
    readMore: string
  }
  booking: {
    title: string
    lead: string
    steps: { where: string; what: string; when: string; who: string } // step names
    where: { shop: string; shopHint: string; mobile: string; mobileHint: string }
    what: {
      pickJobs: string
      custom: string // label for "something not in the list"
      customPlaceholder: string
      device: string
      brand: string
      model: string
      year: string
      issue: string
      issuePlaceholder: string
    }
    when: { pickDay: string; pickTime: string; noSlots: string; location: string; locationPlaceholder: string }
    who: { name: string; phone: string; email: string; optional: string; consent: string }
    summary: { title: string; price: string; eta: string; free: string; diagnosisNote: string }
    back: string
    next: string
    submit: string // "Send booking"
    sending: string
    success: { title: string; body: string; code: string; again: string } // body may use {code}
    errors: {
      required: string
      phone: string
      email: string
      pickOne: string // pick a job or describe a custom one
      server: string
    }
  }
  faq: { title: string; items: { q: string; a: string }[] } // 6-8 items
  contact: {
    title: string
    address: string
    hours: string[] // lines like "Mon–Fri 09:00–18:00"
    call: string
    whatsapp: string
    directions: string
  }
  footer: { rights: string; made: string }
}
