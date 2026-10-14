import type { NetworkNode } from '../api/types'

/**
 * Which trading hubs each PJM zone is drawn next to on the welcome network.
 * This is a visual grouping by region, not an electrical model.
 */
export const ZONE_HUBS: Record<string, string[]> = {
  AECO: ['EASTERN HUB', 'NEW JERSEY HUB'],
  JCPL: ['NEW JERSEY HUB'],
  PSEG: ['NEW JERSEY HUB'],
  RECO: ['NEW JERSEY HUB'],
  PECO: ['EASTERN HUB'],
  DPL: ['EASTERN HUB'],
  PPL: ['WESTERN HUB', 'EASTERN HUB'],
  METED: ['WESTERN HUB'],
  PENELEC: ['WESTERN HUB'],
  APS: ['WESTERN HUB'],
  'MID-ATL/APS': ['WESTERN HUB', 'EASTERN HUB'],
  BGE: ['WESTERN HUB', 'DOMINION HUB'],
  PEPCO: ['WESTERN HUB', 'DOMINION HUB'],
  DOM: ['DOMINION HUB'],
  AEP: ['AEP-DAYTON HUB', 'AEP GEN HUB'],
  DAY: ['AEP-DAYTON HUB'],
  DEOK: ['OHIO HUB', 'AEP-DAYTON HUB'],
  OVEC: ['OHIO HUB'],
  EKPC: ['AEP-DAYTON HUB'],
  DUQ: ['WEST INT HUB'],
  ATSI: ['ATSI GEN HUB', 'OHIO HUB'],
  COMED: ['CHICAGO HUB', 'N ILLINOIS HUB', 'CHICAGO GEN HUB'],
}

/** Hub-to-hub backbone so the regions join up into one web. */
export const HUB_LINKS: [string, string][] = [
  ['EASTERN HUB', 'NEW JERSEY HUB'],
  ['EASTERN HUB', 'WESTERN HUB'],
  ['WESTERN HUB', 'DOMINION HUB'],
  ['WESTERN HUB', 'WEST INT HUB'],
  ['WEST INT HUB', 'AEP-DAYTON HUB'],
  ['AEP-DAYTON HUB', 'AEP GEN HUB'],
  ['AEP-DAYTON HUB', 'OHIO HUB'],
  ['OHIO HUB', 'ATSI GEN HUB'],
  ['AEP-DAYTON HUB', 'N ILLINOIS HUB'],
  ['N ILLINOIS HUB', 'CHICAGO HUB'],
  ['CHICAGO HUB', 'CHICAGO GEN HUB'],
]

export const CENTER = 'PJM-RTO'

const DEMO_HUBS = ['WESTERN HUB', 'EASTERN HUB', 'NEW JERSEY HUB', 'DOMINION HUB', 'WEST INT HUB', 'AEP-DAYTON HUB', 'AEP GEN HUB', 'OHIO HUB', 'ATSI GEN HUB', 'N ILLINOIS HUB', 'CHICAGO HUB', 'CHICAGO GEN HUB']

/** Placeholder nodes shown until day-ahead LMP data has been uploaded. */
export function demoNodes(): NetworkNode[] {
  const names = [CENTER, ...DEMO_HUBS, ...Object.keys(ZONE_HUBS)]
  return names.map((name, i) => {
    const base = 35 + Math.sin(i * 1.7) * 8
    const congestion = Math.sin(i * 2.3) * 9
    return {
      id: -(i + 1),
      name,
      type: name.endsWith('HUB') ? 'HUB' : 'ZONE',
      zone: null,
      avgLmp: base + congestion,
      avgCongestion: congestion,
      hourly: Array.from({ length: 24 }, (_, h) => base + congestion + 15 * Math.sin(((h - 7) / 24) * Math.PI * 2)),
    }
  })
}
