import { AnimatePresence, motion } from 'motion/react'

/**
 * Loader for a 3D panel: the logo's N trace fills as assets load, then fades.
 * It sits inside its panel (absolute), so the page around it is usable at once.
 */
export function Loader({ progress, done }: { progress: number; done: boolean }) {
  const p = Math.max(0, Math.min(progress, 100)) / 100
  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="loader"
          className="absolute inset-0 z-10 grid place-items-center bg-surface-2"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          role="status"
          aria-live="polite"
        >
          <svg width="56" height="56" viewBox="0 0 32 32" aria-hidden="true" className="text-ink">
            <path d="M8 25V10.2c0-.9 1.1-1.4 1.8-.8L22.2 21.6c.7.6 1.8.1 1.8-.8V7" fill="none" stroke="var(--line)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            <path
              d="M8 25V10.2c0-.9 1.1-1.4 1.8-.8L22.2 21.6c.7.6 1.8.1 1.8-.8V7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              style={{ strokeDasharray: 1, strokeDashoffset: 1 - p, transition: 'stroke-dashoffset 300ms ease' }}
            />
            <circle cx="8" cy="25" r="2.9" fill="var(--gold-soft)" />
            <circle cx="24" cy="7" r="2.9" fill={p >= 1 ? 'var(--gold-soft)' : 'var(--line)'} />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
