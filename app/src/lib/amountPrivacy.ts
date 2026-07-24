const STORAGE_KEY = 'yuzu_hide_amounts'

/** Display placeholder when dollar amounts are hidden (fr-CA style). */
export const MASKED_CAD = '***\u00a0$'

type Listener = () => void

let hidden = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1'
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l()
}

export function areAmountsHidden(): boolean {
  return hidden
}

export function setAmountsHidden(next: boolean) {
  if (hidden === next) return
  hidden = next
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
  notify()
}

export function toggleAmountsHidden() {
  setAmountsHidden(!hidden)
}

export function subscribeAmountsHidden(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
