/** Dev-only preview for the workshop scene: open /three-preview.html on the Vite dev server. */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MODEL_PARTS, MODELS, sceneState, STOPS, type ModelId, type StopId, type Theme } from './contract'
import DeviceStage from './DeviceStage'
import { getModel } from './devices'
import WorkshopCanvas from './WorkshopCanvas'

const q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d)
sceneState.t = num('t', 0)
sceneState.frame = num('frame', q.has('model') ? 0 : 0.35)
sceneState.explode = num('explode', 0)
sceneState.model = (q.get('model') as ModelId | null) || null
sceneState.highlight = q.get('hl') || null
sceneState.tour = q.get('tour') === '1'
sceneState.focus = (q.get('focus') as StopId | null) || null

if (import.meta.env.DEV) (window as unknown as { __devices?: unknown }).__devices = { getModel }

type View = 'shop' | 'stage' | 'explore'
type Aspect = 'full' | 'portrait' | 'landscape' | 'band'

const PART_LABELS: Record<string, string> = Object.fromEntries(
  MODELS.flatMap((m) => (MODEL_PARTS[m] as readonly string[]).map((p) => [`${m}.${p}`, p.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())])),
)

function frameStyle(aspect: Aspect): React.CSSProperties {
  if (aspect === 'portrait') return { position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', height: '100%', aspectRatio: '0.7', maxWidth: '100%', outline: '1px dashed rgba(127,127,127,.4)' }
  if (aspect === 'landscape') return { position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', width: '100%', aspectRatio: '1.6', maxHeight: '100%', outline: '1px dashed rgba(127,127,127,.4)' }
  if (aspect === 'band') return { position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', width: '100%', aspectRatio: '2', maxHeight: '100%', outline: '1px dashed rgba(127,127,127,.4)' }
  return { position: 'absolute', inset: 0 }
}

function Preview() {
  const [theme, setTheme] = useState<Theme>((q.get('theme') as Theme) || 'dark')
  const [view, setView] = useState<View>((q.get('view') as View) || 'shop')
  const [aspect, setAspect] = useState<Aspect>((q.get('aspect') as Aspect) || 'full')
  const [t, setT] = useState(sceneState.t)
  const [focus, setFocus] = useState<StopId | ''>(sceneState.focus ?? '')
  const [model, setModel] = useState<ModelId | ''>(sceneState.model ?? '')
  const [explode, setExplode] = useState(sceneState.explode > 0.5)
  const [hl, setHl] = useState(sceneState.highlight ?? '')
  const [frame, setFrame] = useState(sceneState.frame)
  const [tour, setTour] = useState(sceneState.tour)
  const [rm, setRm] = useState(q.get('rm') === '1')
  const [hs, setHs] = useState(q.get('hs') !== '0')
  const ui = q.get('ui') !== '0'

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    const move = (e: PointerEvent) => {
      sceneState.pointer.x = (e.clientX / innerWidth) * 2 - 1
      sceneState.pointer.y = -((e.clientY / innerHeight) * 2 - 1)
    }
    addEventListener('pointermove', move)
    return () => removeEventListener('pointermove', move)
  }, [])
  // Mirror scene-driven changes (tour, hotspot clicks in explore mode) back into the controls.
  useEffect(() => {
    const id = setInterval(() => {
      setFocus(sceneState.focus ?? '')
      setModel(sceneState.model ?? '')
      setExplode(sceneState.explode > 0.5)
      setTour(sceneState.tour)
    }, 250)
    return () => clearInterval(id)
  }, [])

  const pickModel = (m: ModelId | '') => {
    sceneState.model = m || null
    sceneState.highlight = null
    setHl('')
    setModel(m)
    if (m && view !== 'stage') {
      const stop = ({ laptop: 'laptop', pc: 'laptop', it: 'laptop', board: 'bench', vintage: 'bench', coffee: 'coffee', appliance: 'coffee', auto: 'door', largeAppliance: 'door' } as const)[m]
      sceneState.focus = stop
      setFocus(stop)
    }
  }

  return (
    <>
      <div style={frameStyle(aspect)} data-testid="frame">
        {view === 'stage' ? (
          <DeviceStage theme={theme} reducedMotion={rm} partLabels={PART_LABELS} />
        ) : (
          <WorkshopCanvas
            key={view}
            theme={theme}
            reducedMotion={rm}
            showHotspots={hs}
            interactive={view === 'explore'}
            partLabels={PART_LABELS}
            onSelect={(id) => {
              sceneState.focus = id
              setFocus(id)
            }}
          />
        )}
      </div>
      {ui && (
        <div style={{ position: 'fixed', left: 12, bottom: 12, display: 'grid', gap: 6, padding: 12, borderRadius: 10, background: 'rgba(127,127,127,.18)', backdropFilter: 'blur(8px)', minWidth: 300, zIndex: 50 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['shop', 'stage', 'explore'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ fontWeight: view === v ? 700 : 400 }}>
                {v === 'shop' ? 'shop (hero)' : v === 'stage' ? 'device stage' : 'interactive shop'}
              </button>
            ))}
          </div>
          <label>
            model{' '}
            <select value={model} onChange={(e) => pickModel(e.target.value as ModelId | '')}>
              <option value="">(none)</option>
              {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>{' '}
            <label><input type="checkbox" checked={explode} onChange={(e) => { sceneState.explode = e.target.checked ? 1 : 0; setExplode(e.target.checked) }} /> explode</label>
          </label>
          <label>
            highlight{' '}
            <select value={hl} onChange={(e) => { sceneState.highlight = e.target.value || null; setHl(e.target.value) }}>
              <option value="">(none)</option>
              {model && (MODEL_PARTS[model] as readonly string[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            aspect{' '}
            <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)}>
              <option value="full">full window</option>
              <option value="portrait">portrait 0.7</option>
              <option value="landscape">landscape 1.6</option>
              <option value="band">band 2.0</option>
            </select>
          </label>
          {view !== 'stage' && (
            <>
              <label>
                t {t.toFixed(2)}{' '}
                <input type="range" min={0} max={4} step={0.01} value={t} style={{ width: '100%' }} onChange={(e) => { const v = Number(e.target.value); sceneState.t = v; setT(v) }} />
              </label>
              <label>
                focus{' '}
                <select value={focus} onChange={(e) => { const v = e.target.value as StopId | ''; sceneState.focus = v || null; setFocus(v) }}>
                  <option value="">(tour / t)</option>
                  {STOPS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>{' '}
                <label><input type="checkbox" checked={tour} onChange={(e) => { sceneState.tour = e.target.checked; setTour(e.target.checked) }} /> auto tour</label>
              </label>
              <label>
                frame {frame.toFixed(2)}{' '}
                <input type="range" min={-1} max={1} step={0.01} value={frame} style={{ width: '100%' }} onChange={(e) => { const v = Number(e.target.value); sceneState.frame = v; setFrame(v) }} />
              </label>
            </>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>theme: {theme}</button>
            <label><input type="checkbox" checked={rm} onChange={(e) => setRm(e.target.checked)} /> reduced motion</label>
            <label><input type="checkbox" checked={hs} onChange={(e) => setHs(e.target.checked)} /> hotspots</label>
          </div>
        </div>
      )}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
