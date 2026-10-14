import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import { Box, useMediaQuery } from '@mui/material'
import type { NetworkNode } from '../api/types'
import { CENTER, HUB_LINKS, ZONE_HUBS } from './pjmTopology'

type GNode = NodeObject & { name: string; kind: 'center' | 'hub' | 'zone'; data: NetworkNode }
type GLink = LinkObject<GNode> & { strength: number }

/** Blue for negative congestion, grey near zero, orange to red for positive. */
function congestionColor(value: number, alpha = 1) {
  const t = Math.max(-1, Math.min(1, value / 15))
  const [r, g, b] = t >= 0 ? [255, Math.round(183 - 110 * t), Math.round(77 - 40 * t)] : [79, Math.round(195 + 20 * t), 247]
  const mix = Math.abs(t)
  const grey = 150
  const c = (v: number) => Math.round(grey + (v - grey) * Math.max(0.35, mix))
  return `rgba(${c(r)},${c(g)},${c(b)},${alpha})`
}

function buildGraph(nodes: NetworkNode[]) {
  const byName = new Map(nodes.map((n) => [n.name, n]))
  const gNodes: GNode[] = nodes.map((n) => ({
    id: n.name,
    name: n.name,
    kind: n.name === CENTER ? 'center' : n.type === 'HUB' ? 'hub' : 'zone',
    data: n,
  }))
  const links: GLink[] = []
  const add = (a: string, b: string) => {
    if (!byName.has(a) || !byName.has(b)) return
    const diff = Math.abs(byName.get(a)!.avgCongestion - byName.get(b)!.avgCongestion)
    links.push({ source: a, target: b, strength: diff })
  }

  const hubs = nodes.filter((n) => n.type === 'HUB').map((n) => n.name)
  for (const hub of hubs) add(CENTER, hub)
  for (const [a, b] of HUB_LINKS) add(a, b)
  for (const n of nodes) {
    if (n.type === 'HUB' || n.name === CENTER) continue
    const mapped = (ZONE_HUBS[n.name] ?? []).filter((h) => byName.has(h))
    // Zones not in the map attach to the hub with the closest average price.
    const targets = mapped.length
      ? mapped
      : hubs
          .slice()
          .sort((a, b) => Math.abs(byName.get(a)!.avgLmp - n.avgLmp) - Math.abs(byName.get(b)!.avgLmp - n.avgLmp))
          .slice(0, 1)
    for (const h of targets) add(n.name, h)
  }
  return { nodes: gNodes, links }
}

interface Props {
  nodes: NetworkNode[]
  height?: number
  onSelect?: (node: NetworkNode | null) => void
}

export default function NetworkGraph({ nodes, height = 520, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<GNode, GLink>>(undefined)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<string | null>(null)
  const isMobile = useMediaQuery('(max-width:600px)')
  const data = useMemo(() => buildGraph(nodes), [nodes])

  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of data.links) {
      const s = typeof l.source === 'object' ? (l.source as GNode).name : String(l.source)
      const t = typeof l.target === 'object' ? (l.target as GNode).name : String(l.target)
      if (!map.has(s)) map.set(s, new Set())
      if (!map.has(t)) map.set(t, new Set())
      map.get(s)!.add(t)
      map.get(t)!.add(s)
    }
    return map
  }, [data])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    g.d3Force('charge')?.strength(isMobile ? -90 : -160)
    g.d3Force('link')?.distance((l: GLink) => ((l.source as GNode).kind === 'center' ? 110 : 55))
    const t = setTimeout(() => g.zoomToFit(600, isMobile ? 20 : 40), 900)
    return () => clearTimeout(t)
  }, [data, isMobile])

  const isLit = (name: string) => !hover || hover === name || neighbours.get(hover)?.has(name)
  const linkName = (end: string | number | GNode | undefined) => (typeof end === 'object' ? end.name : String(end))
  const linkLit = (l: GLink) => !hover || linkName(l.source) === hover || linkName(l.target) === hover

  return (
    <Box ref={containerRef} sx={{ width: '100%', height, touchAction: 'none', cursor: hover ? 'pointer' : 'grab' }}>
      <ForceGraph2D<GNode, GLink>
        ref={graphRef}
        width={width}
        height={height}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={Infinity}
        d3AlphaDecay={0.01}
        d3VelocityDecay={0.25}
        enableNodeDrag
        linkColor={(l) => (linkLit(l) ? 'rgba(120,180,255,0.35)' : 'rgba(120,180,255,0.06)')}
        linkWidth={(l) => (linkLit(l) && hover ? 2 : 1)}
        linkDirectionalParticles={(l) => Math.min(6, 1 + Math.round(l.strength / 2))}
        linkDirectionalParticleSpeed={(l) => 0.002 + Math.min(0.012, l.strength / 1500)}
        linkDirectionalParticleWidth={(l) => (linkLit(l) ? 2.6 : 0.8)}
        linkDirectionalParticleColor={() => '#7fdcff'}
        onNodeHover={(n) => setHover(n ? n.name : null)}
        onNodeClick={(n) => onSelect?.(n.data)}
        onBackgroundClick={() => onSelect?.(null)}
        nodeLabel={(n) => `${n.name}\nAvg LMP $${n.data.avgLmp.toFixed(2)}\nCongestion $${n.data.avgCongestion.toFixed(2)}`}
        nodePointerAreaPaint={(n, color, ctx) => {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, 10, 0, 2 * Math.PI)
          ctx.fill()
        }}
        nodeCanvasObject={(n, ctx, scale) => {
          const lit = isLit(n.name)
          const r = n.kind === 'center' ? 11 : n.kind === 'hub' ? 7 : 4.5
          const pulse = 1 + 0.15 * Math.sin(Date.now() / 400 + (n.data.id % 7))
          const color = congestionColor(n.data.avgCongestion, lit ? 1 : 0.2)

          ctx.save()
          ctx.shadowColor = color
          ctx.shadowBlur = lit ? 18 : 0
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, r * (n.kind === 'zone' ? 1 : pulse), 0, 2 * Math.PI)
          ctx.fill()
          ctx.restore()

          if (n.kind !== 'zone' || hover === n.name || scale > 2.2) {
            const fontSize = Math.max(9 / scale, n.kind === 'center' ? 5 : 3.5)
            ctx.font = `${n.kind === 'zone' ? 400 : 600} ${fontSize}px Inter, Segoe UI, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = lit ? 'rgba(230,240,255,0.92)' : 'rgba(230,240,255,0.2)'
            ctx.fillText(n.name, n.x!, n.y! + r + 2)
          }
        }}
      />
    </Box>
  )
}
