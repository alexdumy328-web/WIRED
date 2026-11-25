/** Dev-only preview for the device viewer: open /three-preview.html on the Vite dev server. */
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MODEL_PARTS, MODELS, sceneState, type ModelId, type Theme } from './contract'
import DeviceStage from './DeviceStage'
import { getModel } from './devices'

const q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d)
sceneState.highlight = q.get('hl') || null

if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __devices: { getModel }, __sceneState: sceneState })

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
  const [aspect, setAspect] = useState<Aspect>((q.get('aspect') as Aspect) || 'full')
  const [model, setModel] = useState<ModelId>((q.get('model') as ModelId | null) || 'laptop')
  const [explode, setExplode] = useState(num('explode', 1) > 0.5)
  const [hl, setHl] = useState(sceneState.highlight ?? '')
  const [rm, setRm] = useState(q.get('rm') === '1')
  const ui = q.get('ui') !== '0'

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])
  const pickModel = (m: ModelId) => {
    sceneState.highlight = null
    setHl('')
    setModel(m)
  }

  return (
    <>
      <div style={frameStyle(aspect)} data-testid="frame">
        <DeviceStage model={model} explode={explode ? 1 : 0} theme={theme} reducedMotion={rm} partLabels={PART_LABELS} />
      </div>
      {ui && (
        <div style={{ position: 'fixed', left: 12, bottom: 12, display: 'grid', gap: 6, padding: 12, borderRadius: 10, background: 'rgba(127,127,127,.18)', backdropFilter: 'blur(8px)', minWidth: 300, zIndex: 50 }}>
          <label>
            model{' '}
            <select value={model} onChange={(e) => pickModel(e.target.value as ModelId)}>
              {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>{' '}
            <label><input type="checkbox" checked={explode} onChange={(e) => setExplode(e.target.checked)} /> explode</label>
          </label>
          <label>
            highlight{' '}
            <select value={hl} onChange={(e) => { sceneState.highlight = e.target.value || null; setHl(e.target.value) }}>
              <option value="">(none)</option>
              {(MODEL_PARTS[model] as readonly string[]).map((p) => <option key={p} value={p}>{p}</option>)}
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
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>theme: {theme}</button>
            <label><input type="checkbox" checked={rm} onChange={(e) => setRm(e.target.checked)} /> reduced motion</label>
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
