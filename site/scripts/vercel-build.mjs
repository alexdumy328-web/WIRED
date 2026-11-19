// Builds the site and the API into Vercel's Build Output API layout:
//   .vercel/output/static          -> Vite build (served from the CDN)
//   .vercel/output/functions/api.func -> bundled Express app (one Node function)
//   .vercel/output/config.json     -> routes: /api/* to the function, SPA fallback
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, '.vercel', 'output')
const fn = path.join(out, 'functions', 'api.func')

rmSync(out, { recursive: true, force: true })
execSync('npm run build', { cwd: root, stdio: 'inherit' })

mkdirSync(path.join(out, 'static'), { recursive: true })
cpSync(path.join(root, 'dist'), path.join(out, 'static'), { recursive: true })

mkdirSync(fn, { recursive: true })
await build({
  entryPoints: [path.join(root, 'server', 'vercel.ts')],
  outfile: path.join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: 'linked',
  // CJS deps (express) call require(); give the ESM bundle a real one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  // Optional mongodb peers we never use.
  external: [
    'kerberos',
    '@mongodb-js/zstd',
    'snappy',
    'socks',
    'aws4',
    'mongodb-client-encryption',
    'gcp-metadata',
    '@aws-sdk/credential-providers',
  ],
  logLevel: 'info',
})
writeFileSync(path.join(fn, 'package.json'), JSON.stringify({ type: 'module' }))
writeFileSync(
  path.join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 10 }, null, 2),
)

writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '^/api/(.*)$', dest: '/api?__path=$1' },
        { src: '^/api/?$', dest: '/api?__path=' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
)
console.log('Vercel output ready in .vercel/output')
