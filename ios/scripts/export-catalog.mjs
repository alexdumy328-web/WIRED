// Writes the website's price list and public holidays to NorgelisTech/Resources/catalog.json,
// so the app books with the same jobs, prices and opening days as the site.
// Run from the repository root: node ios/scripts/export-catalog.mjs   (Node 22.18 or later)
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { catalog } from '../../site/src/data/catalog.ts'
import { jobPrice } from '../../site/src/lib/estimate.ts'
import { ROMANIAN_HOLIDAYS } from '../../site/src/lib/hours.ts'
import { VALUE_TIERS } from '../../site/src/lib/pricing.ts'

const jobs = catalog.map((job) => {
  const [priceFrom, priceTo] = jobPrice(job, null)
  const out = {
    id: job.id,
    category: job.category,
    mode: job.mode,
    name: job.name,
    description: job.description,
    priceFrom,
    priceTo,
    etaHours: job.etaHours,
    needsDiagnosis: job.needsDiagnosis === true,
    partsExtra: job.partsExtra === true,
  }
  if (job.hourly?.byValue) {
    // The price follows what the device is worth today.
    out.byValue = Object.fromEntries(VALUE_TIERS.map((tier) => [tier, jobPrice(job, tier)]))
  }
  return out
})

const target = fileURLToPath(new URL('../NorgelisTech/Resources/catalog.json', import.meta.url))
writeFileSync(target, JSON.stringify({ jobs, holidays: ROMANIAN_HOLIDAYS }, null, 1) + '\n')
console.log(`${jobs.length} jobs, ${ROMANIAN_HOLIDAYS.length} holidays -> ${target}`)
