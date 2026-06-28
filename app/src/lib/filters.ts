/** Case-insensitive match against any field. */
export function matchesSearch(query: string, ...fields: (string | null | undefined | number)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q))
}

export function inDateRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

export function countActiveFilters(...flags: boolean[]): number {
  return flags.filter(Boolean).length
}
