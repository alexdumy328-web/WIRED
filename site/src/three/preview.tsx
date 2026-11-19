/** Dev-only preview for the workshop scene: open /three-preview.html on the Vite dev server. */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { sceneState, STOPS, type StopId, type Theme } from './contract'
import WorkshopCanvas from './WorkshopCanvas'

const q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d)
sceneState.t = num('t', 0)
sceneState.frame = num('frame', 0.35)
sceneState.explode = num('explode', 0)
sceneState.focus = (q.get('focus') as StopId | null) || null

function Preview() {
  const [theme, setTheme] = useState<Theme>((q.get('theme') as Theme) || 'dark')
  const [t, setT] = useState(sceneState.t)
  const [focus, setFocus] = useState<StopId | ''>(sceneState.focus ?? '')
  const [explode, setExplode] = useState(sceneState.explode)
  const [frame, setFrame] = useState(sceneState.frame)
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

  return (
    <>
      <div style={{ position: 'fixed', inset: 0 }}>
        <WorkshopCanvas
          theme={theme}
          reducedMotion={rm}
          showHotspots={hs}
          onSelect={(id) => {
            sceneState.focus = id
            setFocus(id)
          }}
        />
      </div>
      {ui && (
        <div style={{ position: 'fixed', left: 12, bottom: 12, display: 'grid', gap: 6, padding: 12, borderRadius: 10, background: 'rgba(127,127,127,.18)', backdropFilter: 'blur(8px)', minWidth: 300 }}>
          <label>
            t {t.toFixed(2)}{' '}
            <input type="range" min={0} max={4} step={0.01} value={t} style={{ width: '100%' }} onChange={(e) => { const v = Number(e.target.value); sceneState.t = v; setT(v) }} />
          </label>
          <label>
            focus{' '}
            <select value={focus} onChange={(e) => { const v = e.target.value as StopId | ''; sceneState.focus = v || null; setFocus(v) }}>
              <option value="">(tour / t)</option>
              {STOPS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            explode {explode.toFixed(2)}{' '}
            <input type="range" min={0} max={1} step={0.01} value={explode} style={{ width: '100%' }} onChange={(e) => { const v = Number(e.target.value); sceneState.explode = v; setExplode(v) }} />
          </label>
          <label>
            frame {frame.toFixed(2)}{' '}
            <input type="range" min={-1} max={1} step={0.01} value={frame} style={{ width: '100%' }} onChange={(e) => { const v = Number(e.target.value); sceneState.frame = v; setFrame(v) }} />
          </label>
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
