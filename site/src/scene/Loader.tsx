import { AnimatePresence, motion } from 'motion/react'

/**
 * Full-screen loader: the logo's N trace fills as assets load, then the panel lifts away.
 * Lives in the main bundle so it can also serve as the Suspense fallback.
 */
export function Loader({ progress, done }: { progress: number; done: boolean }) {
  const p = Math.max(0, Math.min(progress, 100)) / 100
  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="loader"
          className="fixed inset-0 z-[100] grid place-items-center bg-bg"
          initial={{ opacity: 1 }}
          exit={{ clipPath: 'inset(0 0 100% 0)' }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-6 text-ink">
            <svg width="88" height="88" viewBox="0 0 32 32" aria-hidden="true">
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
              <circle cx="24" cy="7" r="2.9" fill={p >= 1 ? 'var(--gold-soft)' : 'var(--line)'} style={{ transition: 'fill 200ms' }} />
            </svg>
            <span className="text-sm text-muted" style={{ fontStretch: '115%' }}>
              {Math.round(p * 100)}%
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
