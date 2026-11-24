/**
 * Privacy policy and terms of service, in Romanian and English. Plain data: the pages render it.
 * Not legal advice. Have a lawyer read it before launch, and fill in OPERATOR (legal name, CUI,
 * trade register number) once they exist: empty values are left out of the page.
 */

export const LEGAL_UPDATED = '2026-11-25'

export const OPERATOR = {
  name: 'Norgelis Tech',
  /** Legal name of the company, if different (for example "Norgelis Tech SRL"). */
  legalName: '',
  cui: '',
  regCom: '',
  address: 'Bd. Alexandru cel Bun 49, bl. Y1, parter, Iași',
  phone: '+40 771 332 210',
  email: '',
} as const

export type LegalSection = { h: string; p?: string[]; ul?: string[] }
export type LegalDoc = { title: string; lead: string; sections: LegalSection[] }
type Both = { ro: LegalDoc; en: LegalDoc }

export const PRIVACY: Both = {
  ro: {
    title: 'Politica de confidențialitate',
    lead: 'Explicăm ce date personale prelucrăm când folosești site-ul sau aplicația Norgelis Tech, de ce, cât timp le păstrăm și ce drepturi ai.',
    sections: [
      {
        h: '1. Cine este operatorul',
        p: [
          'Operatorul datelor este Norgelis Tech, atelier de reparații electronice din Iași (datele de contact sunt la finalul paginii). Prelucrăm datele conform Regulamentului (UE) 2016/679 (GDPR) și legislației române.',
        ],
      },
      {
        h: '2. Ce date prelucrăm',
        ul: [
          'Cont: nume, adresă de email, parola (păstrată doar sub formă criptată, nu o putem citi) sau, la autentificarea cu Google, numele și emailul din profilul Google.',
          'Programări: nume, telefon, email (opțional), aparatul și defectul descris, data și ora aleasă, adresa de ridicare sau locul intervenției și coordonatele ei, prețul estimat și transportul.',
          'Reparații: fișa de primire a aparatului, istoricul stărilor, notele tehnice, fotografiile făcute la primire, garanția, documentele și sumele facturate.',
          'Date tehnice și de securitate: adresa IP, ora autentificărilor, jurnal de audit al acțiunilor din contul de personal, mesajele de email pe care ți le trimitem.',
          'Locația telefonului: aplicația o folosește doar pe dispozitiv, cât timp e deschisă, pentru traseul șoferului. Nu o trimitem pe server.',
        ],
      },
      {
        h: '3. De ce le folosim și pe ce temei',
        ul: [
          'Ca să îți preluăm programarea, să îți reparăm aparatul, să te anunțăm și să îți dăm garanția: executarea contractului (art. 6 alin. 1 lit. b GDPR).',
          'Ca să păstrăm facturile și documentele contabile: obligație legală (art. 6 alin. 1 lit. c).',
          'Ca să protejăm conturile și serverul, să prevenim abuzurile și să rezolvăm litigii: interes legitim (art. 6 alin. 1 lit. f).',
          'Nu folosim datele tale pentru publicitate, nu le vindem și nu facem profiluri automate cu efecte asupra ta.',
        ],
      },
      {
        h: '4. Cu cine le împărtășim',
        p: ['Folosim furnizori care prelucrează date în numele nostru, pe baza unor contracte de prelucrare:'],
        ul: [
          'găzduirea site-ului și a serverului (Vercel, funcții în regiunea Frankfurt);',
          'baza de date (MongoDB Atlas, Frankfurt, UE);',
          'trimiterea emailurilor de confirmare și a codurilor (Resend);',
          'autentificarea cu Google, doar dacă o alegi;',
          'căutarea adreselor și calculul traseului pentru ridicare (servicii de hărți bazate pe OpenStreetMap): le trimitem adresa pe care o scrii;',
          'estimarea prețului cu ajutorul unui serviciu de inteligență artificială: îi trimitem descrierea defectului și datele aparatului, fără nume, telefon sau email.',
        ],
      },
      {
        h: '5. Transferuri în afara UE',
        p: [
          'Unii furnizori pot prelucra date și în afara Spațiului Economic European. În acest caz ne bazăm pe o decizie de adecvare a Comisiei Europene (de exemplu Cadrul UE–SUA privind confidențialitatea datelor) sau pe clauzele contractuale standard.',
        ],
      },
      {
        h: '6. Cât timp păstrăm datele',
        ul: [
          'Contul: până îl ștergi.',
          'Programările și fișele de reparație: cât durează garanția și cât cere legea. Documentele contabile și facturile se păstrează de regulă 5 ani.',
          'Jurnalele de securitate: cel mult 12 luni.',
          'După ce ștergi contul, programările și documentele pe care legea ne obligă să le păstrăm rămân, dar nu mai sunt legate de cont.',
        ],
      },
      {
        h: '7. Drepturile tale',
        p: [
          'Ai dreptul de acces, rectificare, ștergere, restricționare, portabilitate și opoziție, precum și dreptul de a-ți retrage consimțământul oricând, acolo unde prelucrarea se bazează pe el. Răspundem în cel mult o lună.',
          'Poți șterge contul direct din aplicație (Cont, apoi Șterge contul) sau ne poți scrie ori suna. Ștergerea contului elimină autentificarea și sesiunile tale; programările și documentele de păstrat legal rămân fără legătură cu contul.',
          'Dacă socotești că ți-am încălcat drepturile, poți depune o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), www.dataprotection.ro.',
        ],
      },
      {
        h: '8. Cookie-uri și stocare locală',
        p: [
          'Folosim un cookie de sesiune, strict necesar, ca să rămâi autentificat, și stocare locală pentru limba și tema aleasă. Nu folosim cookie-uri de publicitate sau de urmărire și nu avem analiză a traficului de la terți. Aplicația păstrează sesiunea în Keychain-ul iPhone-ului.',
        ],
      },
      {
        h: '9. Securitate',
        p: [
          'Conexiunile folosesc HTTPS. Parolele sunt păstrate criptat. Accesul personalului depinde de rol: tehnicienii nu văd sumele facturate. Acțiunile din conturile de personal se înregistrează.',
        ],
      },
      {
        h: '10. Copii',
        p: ['Serviciile noastre nu se adresează persoanelor sub 16 ani. Nu colectăm cu bună știință date de la ele.'],
      },
      {
        h: '11. Modificări',
        p: ['Dacă schimbăm această politică, publicăm versiunea nouă aici și actualizăm data. Pentru schimbări importante te anunțăm în aplicație sau pe email.'],
      },
    ],
  },
  en: {
    title: 'Privacy policy',
    lead: 'This explains which personal data we process when you use the Norgelis Tech website or app, why, how long we keep it and what rights you have.',
    sections: [
      {
        h: '1. Who is responsible',
        p: [
          'The data controller is Norgelis Tech, an electronics repair workshop in Iași, Romania (contact details are at the end of this page). We process data under Regulation (EU) 2016/679 (GDPR) and Romanian law.',
        ],
      },
      {
        h: '2. What data we process',
        ul: [
          'Account: name, email address, password (stored only in encrypted form, we cannot read it) or, if you sign in with Google, the name and email from your Google profile.',
          'Bookings: name, phone, email (optional), the device and the problem you describe, the time you pick, the pickup address or the place of the visit and its coordinates, the estimated price and transport.',
          'Repairs: the intake sheet, status history, technical notes, photos taken at intake, warranty, documents and amounts invoiced.',
          'Technical and security data: IP address, sign-in times, an audit log of actions in staff accounts, the emails we send you.',
          'Phone location: the app uses it on the device only, while it is open, for the driver route. We do not send it to the server.',
        ],
      },
      {
        h: '3. Why we use it and on what basis',
        ul: [
          'To take your booking, repair your device, keep you informed and give you the warranty: performance of a contract (art. 6(1)(b) GDPR).',
          'To keep invoices and accounting records: legal obligation (art. 6(1)(c)).',
          'To protect accounts and the server, prevent abuse and settle disputes: legitimate interest (art. 6(1)(f)).',
          'We do not use your data for advertising, we do not sell it and we do not make automated profiles that affect you.',
        ],
      },
      {
        h: '4. Who we share it with',
        p: ['We use providers that process data on our behalf under data processing terms:'],
        ul: [
          'hosting of the website and server (Vercel, functions in the Frankfurt region);',
          'the database (MongoDB Atlas, Frankfurt, EU);',
          'sending confirmation emails and codes (Resend);',
          'Google sign-in, only if you choose it;',
          'address search and route calculation for pickups (OpenStreetMap-based map services): they receive the address you type;',
          'the price estimate, made with an artificial intelligence service: it receives the problem description and the device details, without name, phone or email.',
        ],
      },
      {
        h: '5. Transfers outside the EU',
        p: [
          'Some providers may also process data outside the European Economic Area. In that case we rely on a European Commission adequacy decision (for example the EU–US Data Privacy Framework) or on standard contractual clauses.',
        ],
      },
      {
        h: '6. How long we keep it',
        ul: [
          'Your account: until you delete it.',
          'Bookings and repair records: for the warranty period and as long as the law requires. Invoices and accounting documents are normally kept for 5 years.',
          'Security logs: 12 months at most.',
          'After you delete your account, bookings and documents we must keep by law stay, but are no longer linked to the account.',
        ],
      },
      {
        h: '7. Your rights',
        p: [
          'You have the right of access, rectification, erasure, restriction, portability and objection, and the right to withdraw consent at any time where processing relies on it. We answer within one month.',
          'You can delete your account in the app (Account, then Delete account) or write to or call us. Deleting the account removes your sign-in and sessions; bookings and records we must keep by law stay, unlinked from the account.',
          'If you think we have infringed your rights, you can complain to the National Supervisory Authority for Personal Data Processing (ANSPDCP), www.dataprotection.ro.',
        ],
      },
      {
        h: '8. Cookies and local storage',
        p: [
          'We use one strictly necessary session cookie to keep you signed in, and local storage for your language and theme. We use no advertising or tracking cookies and no third-party traffic analytics. The app keeps your session in the iPhone Keychain.',
        ],
      },
      {
        h: '9. Security',
        p: [
          'Connections use HTTPS. Passwords are stored encrypted. Staff access depends on role: technicians cannot see invoiced amounts. Actions in staff accounts are logged.',
        ],
      },
      {
        h: '10. Children',
        p: ['Our services are not aimed at people under 16. We do not knowingly collect data from them.'],
      },
      {
        h: '11. Changes',
        p: ['If we change this policy we publish the new version here and update the date. For important changes we tell you in the app or by email.'],
      },
    ],
  },
}

export const TERMS: Both = {
  ro: {
    title: 'Termeni și condiții',
    lead: 'Aceste reguli se aplică programărilor și reparațiilor făcute prin site-ul sau aplicația Norgelis Tech și folosirii conturilor.',
    sections: [
      {
        h: '1. Cine suntem',
        p: ['Norgelis Tech este un atelier de reparații electronice din Iași: laptopuri, PC-uri, plăci electronice, espressoare, electrocasnice mici, aparatură audio vintage și electrică auto, la atelier sau la tine.'],
      },
      {
        h: '2. Programările',
        ul: [
          'O programare făcută online este o cerere pentru ziua și ora aleasă. O primești pe email sau telefon și o poți urmări cu codul primit.',
          'Atelierul e închis duminica și de sărbătorile legale. Orele disponibile se văd la programare.',
          'Dacă nu mai poți veni, anunță-ne cât mai devreme, la telefon.',
        ],
      },
      {
        h: '3. Prețuri și devize',
        ul: [
          'Prețurile din listă sunt în lei, cu TVA inclus. Prețul afișat la programare este o estimare, nu o ofertă finală.',
          'Diagnosticul este gratuit la atelier dacă faci reparația la noi, altfel costă 50 de lei.',
          'Primești prețul final și timpul estimat înainte de orice piesă sau lucrare. Nu continuăm fără acordul tău.',
          'Piesele se plătesc separat, acolo unde lista spune asta.',
          'Ridicarea și livrarea la adresă se taxează după distanță, iar prețul se arată înainte să trimiți programarea. Opțiunea „urgent” adaugă 50% la transport.',
        ],
      },
      {
        h: '4. Cum lucrăm cu aparatul tău',
        ul: [
          'Aparatul poate fi deschis și testat pentru diagnostic. Unele defecte nu pot fi reparate: în acest caz aparatul se întoarce nereparat, iar costul diagnosticului se poate aplica.',
          'Fă o copie a datelor tale înainte să ne dai aparatul. Dacă îți salvăm datele, o facem doar la cererea ta. Nu răspundem pentru pierderea datelor decât în limitele prevăzute de lege.',
          'Te anunțăm când aparatul e gata. Te rugăm să îl ridici în timp util.',
        ],
      },
      {
        h: '5. Garanția',
        ul: [
          'Manopera are garanție 3 luni de la ridicare. Piesele au garanția producătorului.',
          'Garanția nu acoperă defecte noi, lichide, lovituri, folosirea necorespunzătoare sau intervenții ale altor persoane după reparație.',
          'Drepturile tale legale de consumator rămân neatinse.',
        ],
      },
      {
        h: '6. Contul',
        ul: [
          'Ne dai date corecte și îți păstrezi parola în siguranță. Ești responsabil pentru ce se face din contul tău.',
          'Putem suspenda un cont folosit abuziv sau în fraudă.',
          'Îți poți șterge contul oricând, din aplicație sau cerând-o nouă. Detalii în politica de confidențialitate.',
        ],
      },
      {
        h: '7. Răspundere',
        p: ['Răspundem pentru pagubele pe care le cauzăm din vina noastră, în limitele legii. Nu excludem și nu limităm răspunderea acolo unde legea nu permite. Nu răspundem pentru defecte ale aparatului care existau înainte de reparație și nu au legătură cu lucrarea făcută.'],
      },
      {
        h: '8. Reclamații',
        p: ['Dacă ceva nu e în regulă, spune-ne și căutăm o soluție. Ca consumator poți apela și la Autoritatea Națională pentru Protecția Consumatorilor (ANPC), www.anpc.ro.'],
      },
      {
        h: '9. Legea aplicabilă',
        p: ['Se aplică legea română. Litigiile se rezolvă pe cale amiabilă, iar dacă nu e posibil, de instanțele competente din Iași, fără a aduce atingere dreptului consumatorilor de a se adresa instanței de la domiciliul lor.'],
      },
      {
        h: '10. Modificări',
        p: ['Putem actualiza acești termeni. Versiunea în vigoare este cea publicată aici, cu data de la început.'],
      },
    ],
  },
  en: {
    title: 'Terms and conditions',
    lead: 'These rules apply to bookings and repairs made through the Norgelis Tech website or app, and to accounts.',
    sections: [
      {
        h: '1. Who we are',
        p: ['Norgelis Tech is an electronics repair workshop in Iași: laptops, PCs, circuit boards, espresso machines, small appliances, vintage audio and car electrics, at the workshop or at your place.'],
      },
      {
        h: '2. Bookings',
        ul: [
          'A booking made online is a request for the day and time you pick. We confirm it by email or phone, and you can follow it with the code you receive.',
          'The workshop is closed on Sundays and public holidays. Free times show when you book.',
          'If you cannot come, tell us as early as you can, by phone.',
        ],
      },
      {
        h: '3. Prices and quotes',
        ul: [
          'List prices are in lei, VAT included. The price shown when you book is an estimate, not a final offer.',
          'Diagnosis is free at the workshop if you repair with us, otherwise it costs 50 lei.',
          'You get the final price and the estimated time before any part or work. We do not go on without your approval.',
          'Parts are charged separately where the list says so.',
          'Pickup and delivery to an address are charged by distance, and the price shows before you send the booking. The "urgent" option adds 50% to transport.',
        ],
      },
      {
        h: '4. How we handle your device',
        ul: [
          'We may open and test the device to diagnose it. Some faults cannot be repaired: then the device goes back unrepaired and the diagnosis fee may apply.',
          'Back up your data before you hand the device over. If we save your data, we do it only at your request. We are not liable for data loss except as the law provides.',
          'We tell you when the device is ready. Please collect it in good time.',
        ],
      },
      {
        h: '5. Warranty',
        ul: [
          'Labour carries a 3-month warranty from collection. Parts carry the manufacturer warranty.',
          'The warranty does not cover new faults, liquids, impact, misuse or work by other people after the repair.',
          'Your legal consumer rights are not affected.',
        ],
      },
      {
        h: '6. Your account',
        ul: [
          'You give us correct details and keep your password safe. You are responsible for what is done through your account.',
          'We may suspend an account used abusively or fraudulently.',
          'You can delete your account at any time, in the app or by asking us. See the privacy policy for details.',
        ],
      },
      {
        h: '7. Liability',
        p: ['We are liable for damage we cause through our fault, within the limits of the law. We do not exclude or limit liability where the law does not allow it. We are not liable for faults that existed before the repair and have nothing to do with the work done.'],
      },
      {
        h: '8. Complaints',
        p: ['If something is wrong, tell us and we will look for a solution. As a consumer you can also contact the National Authority for Consumer Protection (ANPC), www.anpc.ro.'],
      },
      {
        h: '9. Governing law',
        p: ['Romanian law applies. Disputes are settled amicably first and, if that fails, by the competent courts in Iași, without affecting the consumer\'s right to go to the court where they live.'],
      },
      {
        h: '10. Changes',
        p: ['We may update these terms. The version in force is the one published here, with the date at the top.'],
      },
    ],
  },
}

