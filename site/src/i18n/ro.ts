import type { Dict } from './dict'

const ro: Dict = {
  meta: {
    title: 'Norgelis Tech | Reparații electronice în Iași',
    description:
      'Reparăm plăci de bază, laptopuri, PC-uri, espressoare și electrica auto în Iași. Diagnostic gratuit la atelier dacă faci reparația, service mobil la mașina ta.',
  },
  nav: {
    services: 'Servicii',
    mobile: 'Service mobil',
    process: 'Cum lucrăm',
    workshop: 'Atelierul',
    reviews: 'Recenzii',
    faq: 'Întrebări',
    book: 'Programare',
    track: 'Urmărește reparația',
    themeLight: 'Temă luminoasă',
    themeDark: 'Temă întunecată',
    themeSystem: 'Temă din sistem',
    language: 'Limba',
    openMenu: 'Deschide meniul',
    closeMenu: 'Închide meniul',
  },
  status: {
    openNow: 'Deschis acum, până la {time}',
    closedNow: 'Închis, deschidem {day} la {time}',
  },
  hero: {
    title: 'Reparăm electronica până la componentă',
    lead: 'Laptopuri, PC-uri, espressoare și electrica auto. Lucrăm în atelierul nostru de pe Bd. Alexandru cel Bun sau venim direct la mașina ta.',
    ctaBook: 'Fă o programare',
    ctaPrices: 'Vezi prețurile',
    scrollHint: 'Derulează pentru a vedea atelierul',
  },
  tour: {
    overview: {
      title: 'Atelierul nostru',
      body: 'Laboratorul are pereți negri și albi, lumini LED puternice și două bancuri de lucru pentru reparații.',
    },
    pcbWall: {
      title: 'Peretele cu plăci',
      body: 'Plăci de bază și ECU-uri auto pe care le-am reparat sau salvat. Le păstrăm ca dovadă a lucrului făcut.',
    },
    bench: {
      title: 'Bancul cu microscop',
      body: 'Microscop stereo, osciloscop și stații de lipit. Aici facem micro-lipituri, rework BGA și căutăm scurtcircuite.',
    },
    counter: {
      title: 'Recepția și ridicarea',
      body: 'Aici primești devizul, aprobi reparația și ridici aparatul. Îți dăm un cod ca să urmărești reparația.',
    },
    door: {
      title: 'Venim la mașina ta',
      body: 'Pentru electrica auto venim la mașina ta, în Iași și în împrejurimi. Diagnoza OBD și montajele se fac pe loc.',
    },
  },
  hotspots: {
    pcbWall: 'Plăci reparate',
    bench: 'Micro-lipituri',
    laptop: 'Laptopuri și PC',
    coffee: 'Espressoare',
    counter: 'Recepție',
    door: 'Service auto',
  },
  services: {
    title: 'Servicii și prețuri',
    lead: 'Prețuri în lei, cu TVA inclus. La reparațiile cu diagnostic, prețul final se stabilește după ce găsim defectul.',
    categories: {
      laptop: {
        name: 'Laptopuri',
        blurb: 'Curățare, pastă termică, ecrane, mufe de alimentare și baterii.',
      },
      pc: {
        name: 'Calculatoare',
        blurb: 'Upgrade, reparații de alimentator, răcire și configurare.',
      },
      board: {
        name: 'Plăci de bază',
        blurb: 'Reparații la nivel de componentă, scurtcircuite și daune de lichid.',
      },
      coffee: {
        name: 'Espressoare',
        blurb: 'Detartrare, garnituri, pompe și râșnițe.',
      },
      appliance: {
        name: 'Electrocasnice',
        blurb: 'Aspiratoare, roboți de bucătărie și module electronice de la mașini de spălat sau cuptoare.',
      },
      it: {
        name: 'Întreținere IT',
        blurb: 'Curățare, reinstalare sistem și copiere date de pe discuri sănătoase.',
      },
    },
    from: 'de la {price} lei',
    fixed: '{price} lei',
    range: '{from}–{to} lei',
    eta: 'gata în {eta}',
    afterDiagnosis: 'prețul final după diagnostic',
    bookThis: 'Programează',
  },
  mobile: {
    title: 'Service mobil auto',
    lead: 'Electrică auto ușoară și medie, făcută la mașina ta. Venim în Iași și în împrejurimi cu tot ce ne trebuie pentru montaj și diagnoză.',
    area: 'Iași și localitățile din apropiere',
    travelFee: 'Deplasarea în Iași este gratuită. În afara orașului, {price} lei pe kilometru.',
    points: [
      'Diagnoză OBD cu scanerul, citire și ștergere a codurilor de eroare',
      'Montaj LED pentru interior, ambient și faruri, acolo unde legea permite',
      'Dashcam, senzori de parcare, camere de marșarier și interfețe CarPlay sau Android Auto',
      'Reparații de cablaj și verificări de consum fantomă al bateriei',
    ],
    bookThis: 'Programează service mobil',
  },
  process: {
    title: 'Cum lucrăm',
    steps: [
      {
        title: 'Ne lași aparatul sau programezi',
        body: 'Vii cu aparatul la atelier sau trimiți o programare din site. Ne spui ce s-a întâmplat și ce model are.',
      },
      {
        title: 'Diagnostic',
        body: 'Verificăm defectul cu microscopul, osciloscopul sau scanerul. La atelier, diagnosticul e gratuit dacă faci reparația, altfel costă 50 de lei.',
      },
      {
        title: 'Deviz pe care îl aprobi',
        body: 'Primești prețul și timpul estimat înainte de orice piesă sau lucru. Nu continuăm fără acordul tău.',
      },
      {
        title: 'Reparăm și testăm',
        body: 'Schimbăm piesele aprobate și testăm aparatul înainte să te anunțăm că e gata. Dacă ai date pe disc, le salvăm întâi.',
      },
      {
        title: 'Ridicare cu garanție',
        body: 'Ridici aparatul și primești factura. Garanția este de 3 luni pentru manoperă, iar piesele au garanția producătorului.',
      },
    ],
  },
  workshop: {
    title: 'Atelierul nostru',
    lead: 'Un laborator modern în Iași, cu două bancuri de lucru, microscop, osciloscop și stații de lipit.',
    photos: {
      lab: 'Laboratorul cu bancuri de lucru, lumini LED și pereți negri și albi',
      entrance: 'Intrarea cu peretele iluminat din plăci de bază și ECU-uri auto',
      pcbWall: 'Plăci de bază și ECU-uri auto reparate sau salvate, pe peretele iluminat',
    },
  },
  eta: {
    title: 'Cât durează',
    lead: 'Timpii tipici de la predare până la ridicare. Reparațiile care așteaptă piese durează mai mult, iar noi îți spunem din timp.',
    chartTitle: 'Timp tipic pe categorie',
    chartUnit: 'zile',
    queueNow: '{n} aparate pe bancă acum',
    hours: '{n} h',
    days: '{n} zile',
    sameDay: 'în aceeași zi',
  },
  track: {
    title: 'Urmărește reparația',
    lead: 'Introdu codul primit la predare, de exemplu NT-4K7Q, ca să vezi unde este aparatul tău.',
    placeholder: 'NT-4K7Q',
    button: 'Verifică',
    notFound: 'Nu găsim niciun aparat cu acest cod. Verifică și încearcă din nou.',
    error: 'Nu am putut verifica acum. Încearcă din nou peste câteva minute.',
    statuses: {
      received: 'Primit la atelier',
      diagnosis: 'În diagnostic',
      'waiting-parts': 'Așteptăm piesa',
      repairing: 'În reparație',
      ready: 'Gata de ridicare',
      done: 'Predat',
    },
    updated: 'Actualizat {when}',
  },
  reviews: {
    title: 'Ce spun clienții',
    summary: '{rating} din 5, din {count} recenzii',
    readMore: 'Citește mai mult',
  },
  booking: {
    title: 'Programare',
    lead: 'Alege ce trebuie reparat, unde și când. Te sunăm sau îți scriem pe WhatsApp ca să confirmăm.',
    steps: {
      where: 'Unde',
      what: 'Ce',
      when: 'Când',
      who: 'Datele tale',
    },
    where: {
      shop: 'La atelier',
      shopHint: 'Bd. Alexandru cel Bun 49, bl. Y1, parter',
      mobile: 'La mașină',
      mobileHint: 'Venim în Iași sau în apropiere',
    },
    what: {
      pickJobs: 'Alege una sau mai multe lucrări',
      custom: 'Altceva, nu găsesc în listă',
      customPlaceholder: 'Descrie aparatul și ce nu merge',
      device: 'Aparat',
      brand: 'Marcă',
      model: 'Model',
      year: 'An fabricație',
      issue: 'Ce s-a întâmplat',
      issuePlaceholder: 'De exemplu, laptopul se oprește după zece minute de joc',
    },
    when: {
      pickDay: 'Alege ziua',
      pickTime: 'Alege ora',
      noSlots: 'Nu mai sunt ore libere în ziua aleasă',
      location: 'Adresa unde venim',
      locationPlaceholder: 'Strada, numărul, cartierul',
    },
    who: {
      name: 'Nume',
      phone: 'Telefon',
      email: 'Email',
      optional: 'opțional',
      consent: 'Sunt de acord ca atelierul să mă contacteze în legătură cu această programare.',
    },
    summary: {
      title: 'Rezumat',
      price: 'Preț estimat',
      eta: 'Timp estimat',
      free: 'Diagnostic gratuit dacă faci reparația',
      diagnosisNote: 'Prețul final se confirmă după diagnostic, înainte de orice lucrare.',
    },
    back: 'Înapoi',
    next: 'Continuă',
    submit: 'Trimite programarea',
    sending: 'Trimitem...',
    success: {
      title: 'Programare primită',
      body: 'Codul tău este {code}. Îl folosești ca să urmărești reparația. Te contactăm în cel mult o zi lucrătoare.',
      code: 'Cod de urmărire',
      again: 'Fă altă programare',
    },
    errors: {
      required: 'Completează acest câmp.',
      phone: 'Introdu un număr de telefon valid.',
      email: 'Introdu o adresă de email validă.',
      pickOne: 'Alege o lucrare sau descrie una nouă.',
      server: 'Nu am putut trimite programarea. Încearcă din nou sau sună-ne.',
    },
  },
  faq: {
    title: 'Întrebări frecvente',
    items: [
      {
        q: 'Cât costă diagnosticul?',
        a: 'La atelier, diagnosticul este gratuit dacă faci reparația. Dacă nu o faci, plătești 50 de lei. La service mobil, diagnosticul OBD costă 150 de lei.',
      },
      {
        q: 'Îmi pierzi datele de pe laptop?',
        a: 'Nu. Dacă discul este sănătos, copiem datele înainte de reinstalare sau de orice alt lucru. Dacă discul este defect, nu garantăm recuperarea și îți spunem asta de la început.',
      },
      {
        q: 'Ce garanție oferiți?',
        a: 'Trei luni de garanție pentru manoperă. Piesele au garanția producătorului, iar devizul trece exact ce piesă s-a montat.',
      },
      {
        q: 'Ce mărci de espressoare reparați?',
        a: 'Lucrăm la espressoare de la mărci mari, precum De\'Longhi, Philips, Jura, Saeco și Krups. Dacă ai alt model, scrie-ne și îți spunem dacă putem repara.',
      },
      {
        q: 'Ce zonă acoperiți cu service mobil?',
        a: 'Venim în Iași și în localitățile din apropiere. Deplasarea în oraș este gratuită, iar în afara lui costă 2 lei pe kilometru.',
      },
      {
        q: 'Ce metode de plată acceptați?',
        a: 'Card, numerar sau transfer bancar. La service mobil plătești după ce terminăm montajul și verifici rezultatul împreună cu noi.',
      },
      {
        q: 'Ce se întâmplă dacă nu se poate repara?',
        a: 'Îți spunem după diagnostic, iar noi nu începem nicio reparație fără acordul tău. Primești aparatul înapoi, iar la atelier plătești doar diagnosticul de 50 de lei.',
      },
    ],
  },
  contact: {
    title: 'Contact',
    address: 'Bd. Alexandru cel Bun 49, bl. Y1, parter, Iași 700634',
    hours: ['Luni–Vineri 09:00–18:00', 'Sâmbătă 10:00–14:00', 'Duminică închis'],
    call: 'Sună-ne la +40 700 000 000',
    whatsapp: 'Scrie-ne pe WhatsApp',
    directions: 'Deschide în Google Maps',
  },
  footer: {
    rights: 'Norgelis Tech. Toate drepturile rezervate.',
    made: 'Făcut în Iași.',
  },
}

export default ro
