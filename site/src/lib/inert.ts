/**
 * Makes everything outside `node` inert (siblings of node and of each ancestor up to <body>),
 * so Tab and screen readers stay inside a modal. Returns the undo.
 */
export function inertOutside(node: HTMLElement | null): () => void {
  const changed: Element[] = []
  let el = node
  while (el && el !== document.body && el.parentElement) {
    for (const sib of el.parentElement.children) {
      if (sib !== el && !sib.hasAttribute('inert')) {
        sib.setAttribute('inert', '')
        changed.push(sib)
      }
    }
    el = el.parentElement
  }
  return () => {
    for (const sib of changed) sib.removeAttribute('inert')
  }
}
