
/** Text that rolls up letter by letter on hover (each letter is stacked twice). */
export function Roll({ text }: { text: string }) {
  return (
    <span className="roll" aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="roll-ch" style={{ transitionDelay: `${i * 14}ms` }} aria-hidden="true" data-ch={ch === ' ' ? ' ' : ch}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}
