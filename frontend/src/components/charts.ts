/** Shared chart colours (match the app's dark theme). */
export const C = {
  auction: '#4fc3f7',
  actual: '#ffb74d',
  positive: '#66bb6a',
  negative: '#ef5350',
  grid: 'rgba(255,255,255,0.08)',
  text: 'rgba(230,240,255,0.85)',
  muted: 'rgba(230,240,255,0.55)',
}

export const money = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`

export const compactMoney = (v: number) => {
  const a = Math.abs(v)
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : a.toFixed(0)
  return `${v < 0 ? '−' : ''}$${s}`
}

export const baseAxis = {
  axisLine: { lineStyle: { color: C.grid } },
  axisLabel: { color: C.muted },
  splitLine: { lineStyle: { color: C.grid } },
}
