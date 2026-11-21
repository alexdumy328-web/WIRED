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
    reviews: string
    faq: string
    book: string // short CTA in the header
    track: string // "track a repair"
    workshop3d: string // link to the interactive 3D workshop page
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
    stageHint: string // under the device viewer: hover a row to light up the part
    categories: Record<'laptop' | 'pc' | 'board' | 'coffee' | 'appliance' | 'it' | 'vintage', { name: string; blurb: string }>
    from: string // "from {price} lei"
    fixed: string // "{price} lei"
    range: string // "{from}–{to} lei"
    eta: string // "ready in {eta}"
    afterDiagnosis: string // "final price after diagnosis"
    perHour: string // "{rate} lei/h"
    perHourRange: string // "{from}–{to} lei/h"
    plusParts: string // "+ parts"
    byValue: string // "rate follows the device's value"
    labour: string // one sentence on the labour model, shown under the lead
    bookThis: string
  }
  mobile: {
    title: string
    lead: string
    area: string // where the van goes
    travelFee: string // e.g. "Travel inside the city is free; outside, {price} lei/km"
    tabs: { auto: string; appliances: string }
    points: { auto: string[]; appliances: string[] } // concrete things done on site
    bookThis: string
  }
  process: {
    title: string
    steps: { title: string; body: string }[] // exactly 5, real sequence
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
    statuses: Record<'received' | 'diagnosis' | 'waiting-parts' | 'repairing' | 'ready' | 'done' | 'cancelled', string>
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
    steps: { where: string; what: string; when: string; whereWhen: string; who: string } // step names; whereWhen for pickup and on-site jobs
    where: { shop: string; shopHint: string; pickup: string; pickupHint: string; mobile: string; mobileHint: string }
    /** Labels for the pickup map (see components/PickupMap.tsx). */
    pickup: {
      title: string
      lead: string
      search: string
      searchPlaceholder: string
      noResults: string
      searchError: string
      useMyLocation: string
      dragHint: string
      trips: Record<'both' | 'pickup' | 'dropoff', string>
      distance: string // "{km} km one way, about {min} min"
      fuel: string
      time: string
      total: string
      perTrip: string // "{price} lei per trip"
      insideIasi: string
      outsideIasi: string
      tooFar: string
      estimated: string
      quoteError: string
      shop: string
      required: string // error when no address is chosen
      urgent: string // line label for the surcharge in the quote panel
      urgentToggle: string // checkbox label
      urgentHint: string // what urgent means
    }
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
      value: string // "What is the device worth today?"
      valueHint: string // why we ask
      valueTiers: Record<'low' | 'mid' | 'high' | 'premium' | 'unknown', string>
    }
    ai: {
      title: string
      lead: string
      button: string
      loading: string
      unavailable: string
      hours: string // "{from}–{to} h of work"
      rate: string // "at {rate}"
      labour: string
      consumables: string // "Consumables: +{pct}%"
      parts: string
      total: string
      confidence: Record<'low' | 'medium' | 'high', string>
      questions: string // heading for the clarifying questions
      disclaimer: string
    }
    when: { pickDay: string; pickDayFirst: string; closedHint: string; todayFull: string; pickTime: string; pickWindow: string; noSlots: string; slotGone: string; location: string; locationPlaceholder: string }
    who: { name: string; phone: string; email: string; optional: string; consent: string }
    summary: { title: string; price: string; eta: string; free: string; diagnosisNote: string; partsExtra: string; pickup: string; repair: string }
    open: string // CTA that opens the booking popup
    close: string // aria-label of the X
    confirmClose: { title: string; leave: string; stay: string }
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
  /** The interactive 3D workshop page. */
  workshopPage: {
    title: string
    lead: string
    explore: string // button on the hero card that opens the page
    stations: string
    parts: string // heading of the part list
    partsHint: string
    explode: string
    assemble: string
    tour: string
    stopTour: string
    back: string
    controls: string // how to move the camera
    stationNames: Record<'overview' | 'pcbWall' | 'bench' | 'laptop' | 'coffee' | 'counter' | 'door', string>
  }
  /** Shown once when a filled form holds the page scroll. */
  scrollHold: string
  /** Label of the 3D window when it shows the whole shop. */
  windowOverview: string
  faq: { title: string; items: { q: string; a: string }[] } // 6-8 items
  contact: {
    title: string
    address: string
    hours: string[] // lines like "Mon–Fri 09:00–18:00"
    call: string
    whatsapp: string
    directions: string
  }
  account: {
    nav: string // header button label
    navSignedIn: string // aria-label of the header button when signed in
    title: string
    lead: string
    google: string
    or: string
    methods: { code: string; password: string }
    fields: { name: string; email: string; password: string; code: string; newPassword: string }
    passwordHint: string
    actions: {
      sendCode: string
      verify: string
      resend: string
      signIn: string
      createAccount: string
      forgot: string
      backToSignIn: string
      reset: string
      signOut: string
    }
    toggles: { toSignUp: string; toSignIn: string }
    msgs: { codeSent: string; confirmSent: string; resetSent: string; resetDone: string; unverified: string }
    errors: {
      email: string
      passwordShort: string
      name: string
      code: string
      invalidCode: string
      locked: string
      rateLimited: string
      mailDown: string
      badLogin: string
      generic: string
    }
    profile: { title: string; name: string; email: string; role: string; verified: string; notVerified: string }
    roles: Record<'customer' | 'owner' | 'dev', string>
    dashboards: { title: string; owner: string; dev: string }
    /** Slim top bar on the owner and dev dashboards (no customer nav there). */
    adminBar: { nav: string; owner: string; dev: string; site: string }
    bookings: {
      title: string
      empty: string
      bookNow: string
      loading: string
      error: string
      code: string
      when: string
      where: Record<'shop' | 'mobile', string>
      pickup: string
      estimate: string
      final: string
      timeline: string
    }
    noAccess: { title: string; body: string; signIn: string; home: string }
    unavailable: string
    loading: string
  }
  owner: {
    title: string
    lead: string
    refresh: string
    loadError: string
    tabs: { today: string; bookings: string; pickups: string; calendar: string; stats: string; settings: string }
    /** Sidebar heading over the small month calendar. */
    jump: string
    today: {
      greeting: Record<'morning' | 'day' | 'evening', string>
      visits: string
      pickups: string
      ready: string
      inShop: string
      agenda: string
      agendaEmpty: string
      /** Title when today is empty and the list shows the next day with bookings: "{day}". */
      agendaNext: string
      readyList: string
      readyEmpty: string
      seeAll: string
      now: string
    }
    bookings: {
      search: string
      searchPlaceholder: string
      status: string
      mode: string
      from: string
      to: string
      all: string
      reset: string
      /** Phone-only toggle for the filters: "Filters" and "Filters ({n})" when some are set. */
      filters: string
      filtersOn: string
      empty: string
      total: string // "{n} bookings"
      loadMore: string
      columns: { code: string; when: string; customer: string; device: string; mode: string; status: string; price: string }
      modes: Record<'shop' | 'pickup' | 'mobile', string>
      dates: string
      range: { label: string; any: string; pickEnd: string; clear: string; presets: { today: string; week: string; month: string; next7: string } }
      pickup: string
    }
    detail: {
      close: string
      contact: string
      phone: string
      email: string
      address: string
      map: string
      issue: string
      estimate: string // "{from}-{to} lei"
      pickup: string
      trips: Record<'both' | 'pickup' | 'dropoff', string>
      urgent: string
      history: string
      noteLabel: string
      notePlaceholder: string
      /** Who made a history entry when the customer did (the booking form). */
      byCustomer: string
      newStatus: string
      save: string
      saved: string
      error: string
      loadError: string
      slotTaken: string
      custom: string
      finalLabel: string
      finalHint: string
      final: string // "{n} lei"
      /** Estimate shown for custom requests that have no list price. */
      noEstimate: string
      notify: string
      noEmail: string
      savedMailed: string
      savedMailFailed: string
    }
    pickups: { title: string; today: string; tomorrow: string; none: string; urgent: string; window: string; call: string; map: string; pickDay: string; stop: string; stops: string; transport: string; prevDay: string; nextDay: string }
    calendar: { title: string; prev: string; next: string; thisWeek: string; free: string; pick: string; closed: string; count: string; legend: { shop: string; mobile: string; pickup: string } }
    stats: {
      title: string
      byCategory: string
      byStatus: string
      /** Under a KPI: the last four weeks against the four before. */
      delta: string
      revenue: string
      done: string
      pipeline: string
      note: string
      total: string
      active: string
      other: Record<'auto' | 'custom', string>
      trend: {
        income: string
        incomeLead: string
        bookings: string
        bookingsLead: string
        range: string
        ranges: Record<'weeks' | 'months', string>
        series: Record<'earned' | 'booked' | 'created' | 'done', string>
        table: string
        period: string
        weekOf: string
        empty: string
      }
    }
    settings: {
      title: string
      lead: string
      pickup: string
      labour: string
      save: string
      saved: string
      invalid: string
      error: string
      range: string // "Between {min} and {max}"
      fields: Record<
        | 'dieselLeiPerL'
        | 'consumptionLPer100'
        | 'driverLeiPerHour'
        | 'stopMinutes'
        | 'minTripLei'
        | 'urgentFactor'
        | 'maxKm'
        | 'valueLow'
        | 'valueMid'
        | 'valueHigh'
        | 'valuePremium'
        | 'consumLow'
        | 'consumMedium'
        | 'consumHigh',
        string
      >
      order: string
    }
  }
  dev: {
    title: string
    lead: string
    refresh: string
    sections: { health: string; env: string; errors: string; audit: string; outbox: string; users: string; limits: string }
    health: {
      mongo: string
      store: string
      environment: string
      mail: string
      google: string
      slotIndex: string
      uptime: string
      versions: string
      ok: string
      down: string
      on: string
      off: string
    }
    env: { name: string; status: string; set: string; unset: string; needed: string }
    errors: { empty: string; when: string; where: string; message: string }
    audit: { empty: string; when: string; action: string; who: string; target: string; detail: string }
    outbox: { empty: string; devOnly: string; to: string; subject: string; kind: string; when: string }
    users: { search: string; email: string; name: string; role: string; verified: string; created: string; saved: string; self: string; error: string }
    limits: { name: string; window: string; max: string; allowed: string; blocked: string; tracked: string }
  }
  footer: { rights: string; made: string }
}
