import type { Dict } from './dict'

const en: Dict = {
  meta: {
    title: 'Norgelis Tech | Electronics repair in Iași',
    description:
      'We repair circuit boards, laptops, PCs, espresso machines and car electrics in Iași. Free diagnosis at the shop if you go ahead with the repair, and mobile service at your car.',
  },
  nav: {
    services: 'Services',
    mobile: 'Mobile service',
    process: 'How we work',
    workshop: 'Workshop',
    reviews: 'Reviews',
    faq: 'Questions',
    book: 'Book',
    track: 'Track a repair',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
    themeSystem: 'System theme',
    language: 'Language',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  status: {
    openNow: 'Open now until {time}',
    closedNow: 'Closed, we open {day} at {time}',
  },
  hero: {
    title: 'We repair circuit boards down to the component',
    lead: 'Laptops, PCs, espresso machines and car electrics. We work in our workshop on Bd. Alexandru cel Bun, or we come straight to your car.',
    ctaBook: 'Book a repair',
    ctaPrices: 'See prices',
    scrollHint: 'Scroll to see the workshop',
  },
  tour: {
    overview: {
      title: 'Our workshop',
      body: 'A bright lab with matte black and white walls, LED panels and two benches for repairs.',
    },
    pcbWall: {
      title: 'The board wall',
      body: 'Motherboards and car ECUs we have repaired or saved. We keep them on display as a record of the work.',
    },
    bench: {
      title: 'Microscope and soldering bench',
      body: 'Stereo microscope, oscilloscope and soldering stations. This is where we do micro-soldering, BGA rework and short hunting.',
    },
    counter: {
      title: 'Reception and pickup',
      body: 'This is where you get the quote, approve the repair and pick up your device. We also give you a tracking code.',
    },
    door: {
      title: 'We come to your car',
      body: 'For car electrics we come to you in Iași and nearby. OBD diagnosis, LED lights and module installs are done on site.',
    },
  },
  hotspots: {
    pcbWall: 'Repaired boards',
    bench: 'Micro-soldering',
    laptop: 'Laptops and PCs',
    coffee: 'Espresso machines',
    counter: 'Reception',
    door: 'Car electrics',
  },
  services: {
    title: 'Services and prices',
    lead: 'Prices in lei, VAT included. For repairs that need diagnosis, the final price is set once we find the fault.',
    categories: {
      laptop: {
        name: 'Laptops',
        blurb: 'Cleaning, thermal paste, screens, charging ports and batteries.',
      },
      pc: {
        name: 'Desktop PCs',
        blurb: 'Upgrades, power supply repairs, cooling and setup.',
      },
      board: {
        name: 'Circuit boards',
        blurb: 'Component-level repairs, short circuits and liquid damage.',
      },
      coffee: {
        name: 'Espresso machines',
        blurb: 'Descaling, gaskets, pumps and grinders.',
      },
      appliance: {
        name: 'Home appliances',
        blurb: 'Vacuum cleaners, kitchen appliances and control boards from washing machines or ovens.',
      },
      it: {
        name: 'IT maintenance',
        blurb: 'Cleaning, system reinstalls and copying data from healthy drives.',
      },
    },
    from: 'from {price} lei',
    fixed: '{price} lei',
    range: '{from}–{to} lei',
    eta: 'ready in {eta}',
    afterDiagnosis: 'final price after diagnosis',
    bookThis: 'Book this',
  },
  mobile: {
    title: 'Mobile car service',
    lead: 'Light to medium car electrics, done at your car. We come to Iași and nearby with everything we need for installs and diagnosis.',
    area: 'Iași and nearby towns',
    travelFee: 'Travel inside Iași is free. Outside the city, {price} lei per kilometer.',
    points: [
      'OBD diagnosis with a scanner, reading and clearing fault codes',
      'LED installs for interior, ambient and headlight bulbs where the law allows',
      'Dashcams, parking sensors, reverse cameras and CarPlay or Android Auto interfaces',
      'Wiring repairs and battery drain checks',
    ],
    bookThis: 'Book mobile service',
  },
  process: {
    title: 'How we work',
    steps: [
      {
        title: 'Drop off your device or book',
        body: 'Bring the device to the workshop or send a booking from this site. Tell us what happened and which model it is.',
      },
      {
        title: 'Diagnosis',
        body: 'We check the fault with the microscope, oscilloscope or scanner. At the shop, diagnosis is free if you go ahead with the repair, otherwise it costs 50 lei.',
      },
      {
        title: 'A quote you approve',
        body: 'You get the price and the estimated time before any part is fitted or any work starts. We do not continue without your approval.',
      },
      {
        title: 'Repair and test',
        body: 'We fit the approved parts and test the device before we tell you it is ready. If you have data on the drive, we save it first.',
      },
      {
        title: 'Pickup with warranty',
        body: 'You pick up the device and get the invoice. The warranty is 3 months on labour, and parts carry the manufacturer warranty.',
      },
    ],
  },
  workshop: {
    title: 'Our workshop',
    lead: 'A modern lab in Iași with two benches, a microscope, an oscilloscope and soldering stations.',
    photos: {
      lab: 'The lab with work benches, LED lights and matte black and white walls',
      entrance: 'The entrance with the backlit wall of circuit boards and car ECUs',
      pcbWall: 'Circuit boards and car ECUs we repaired or saved, on the backlit wall',
    },
  },
  eta: {
    title: 'How long it takes',
    lead: 'Typical time from drop-off to pickup. Repairs that wait for parts take longer, and we tell you early.',
    chartTitle: 'Typical time by category',
    chartUnit: 'days',
    queueNow: '{n} devices on the bench right now',
    hours: '{n} h',
    days: '{n} days',
    sameDay: 'same day',
  },
  track: {
    title: 'Track a repair',
    lead: 'Enter the code you got at drop-off, for example NT-4K7Q, to see where your device is.',
    placeholder: 'NT-4K7Q',
    button: 'Check',
    notFound: 'We cannot find a device with this code. Check it and try again.',
    error: 'We could not check right now. Try again in a few minutes.',
    statuses: {
      received: 'Received at the workshop',
      diagnosis: 'Being diagnosed',
      'waiting-parts': 'Waiting for parts',
      repairing: 'Being repaired',
      ready: 'Ready for pickup',
      done: 'Picked up',
    },
    updated: 'Updated {when}',
  },
  reviews: {
    title: 'What customers say',
    summary: '{rating} out of 5, from {count} reviews',
    readMore: 'Read more',
  },
  booking: {
    title: 'Book a repair',
    lead: 'Choose what needs fixing, where and when. We call or message you on WhatsApp to confirm.',
    steps: {
      where: 'Where',
      what: 'What',
      when: 'When',
      who: 'Your details',
    },
    where: {
      shop: 'At the workshop',
      shopHint: 'Bd. Alexandru cel Bun 49, bl. Y1, ground floor',
      mobile: 'At my car',
      mobileHint: 'We come to Iași or nearby',
    },
    what: {
      pickJobs: 'Pick one or more jobs',
      custom: 'Something else, not in the list',
      customPlaceholder: 'Describe the device and what is wrong',
      device: 'Device',
      brand: 'Brand',
      model: 'Model',
      year: 'Year of manufacture',
      issue: 'What happened',
      issuePlaceholder: 'For example, the laptop shuts down after ten minutes of gaming',
    },
    when: {
      pickDay: 'Pick a day',
      pickTime: 'Pick a time',
      noSlots: 'No free times on that day',
      location: 'Address where we come',
      locationPlaceholder: 'Street, number, area',
    },
    who: {
      name: 'Name',
      phone: 'Phone',
      email: 'Email',
      optional: 'optional',
      consent: 'I agree that the workshop can contact me about this booking.',
    },
    summary: {
      title: 'Summary',
      price: 'Estimated price',
      eta: 'Estimated time',
      free: 'Free diagnosis if you go ahead with the repair',
      diagnosisNote: 'The final price is confirmed after diagnosis, before any work starts.',
    },
    back: 'Back',
    next: 'Continue',
    submit: 'Send booking',
    sending: 'Sending...',
    success: {
      title: 'Booking received',
      body: 'Your code is {code}. Use it to track the repair. We contact you within one working day.',
      code: 'Tracking code',
      again: 'Make another booking',
    },
    errors: {
      required: 'Fill in this field.',
      phone: 'Enter a valid phone number.',
      email: 'Enter a valid email address.',
      pickOne: 'Pick a job or describe a new one.',
      server: 'We could not send your booking. Try again or call us.',
    },
  },
  faq: {
    title: 'Frequently asked questions',
    items: [
      {
        q: 'How much does diagnosis cost?',
        a: 'At the shop, diagnosis is free if you go ahead with the repair. If you do not, it costs 50 lei. For mobile service, OBD diagnosis at your car costs 150 lei.',
      },
      {
        q: 'Will I lose the data on my laptop?',
        a: 'No. If the drive is healthy, we copy your data before a reinstall or any other work. If the drive is failing, we cannot promise recovery, and we tell you that before we start.',
      },
      {
        q: 'What warranty do you give?',
        a: 'Three months on labour. Parts carry the manufacturer warranty, and the quote lists every part we fit.',
      },
      {
        q: 'Which espresso brands do you repair?',
        a: 'We work on machines from major brands, such as De\'Longhi, Philips, Jura, Saeco and Krups. If you have another model, send it to us and we will tell you if we can repair it.',
      },
      {
        q: 'Which area do you cover with mobile service?',
        a: 'We come to Iași and nearby towns. Travel inside the city is free, and outside it costs 2 lei per kilometer.',
      },
      {
        q: 'How can I pay?',
        a: 'By card, cash or bank transfer. For mobile service, you pay once the work is done and you have checked the result together.',
      },
      {
        q: 'What happens if the device cannot be fixed?',
        a: 'We tell you once the diagnosis is done, and we do not start any repair without your approval. You get the device back, and at the shop you pay only the 50 lei diagnosis fee.',
      },
    ],
  },
  contact: {
    title: 'Contact',
    address: 'Bd. Alexandru cel Bun 49, bl. Y1, parter, Iași 700634',
    hours: ['Mon–Fri 09:00–18:00', 'Sat 10:00–14:00', 'Sunday closed'],
    call: 'Call us on +40 700 000 000',
    whatsapp: 'Message us on WhatsApp',
    directions: 'Open in Google Maps',
  },
  footer: {
    rights: 'Norgelis Tech. All rights reserved.',
    made: 'Made in Iași.',
  },
}

export default en
