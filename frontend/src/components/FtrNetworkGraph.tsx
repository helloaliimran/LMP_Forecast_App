import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import { Box, useMediaQuery } from '@mui/material'
import { forceX, forceY } from 'd3-force'
import type { FtrPath, PathNode } from '../api/types'

type GNode = NodeObject & { pnodeId: number; name: string; data: PathNode; radius: number; color: string; hasDa: boolean }
type GLink = LinkObject<GNode> & { data: FtrPath; width: number; color: string }

const LOW = [79, 195, 247] // blue
const MID = [150, 160, 180] // grey
const HIGH = [255, 122, 58] // orange

function mix(a: number[], b: number[], t: number, alpha = 1) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`
}

/** Colour for a value in [-1, 1]: blue (negative) through grey to orange (positive). */
function divergingColor(t: number, alpha = 1) {
  const x = Math.max(-1, Math.min(1, t))
  return x >= 0 ? mix(MID, HIGH, x, alpha) : mix(MID, LOW, -x, alpha)
}

/** Ranks nodal prices among the nodes shown so a few extreme nodes don't wash out the rest. */
function priceRanks(nodes: PathNode[]) {
  const priced = nodes.filter((n) => n.nodalPrice !== null).sort((a, b) => a.nodalPrice! - b.nodalPrice!)
  const rank = new Map<number, number>()
  priced.forEach((n, i) => rank.set(n.pnodeId, priced.length > 1 ? (i / (priced.length - 1)) * 2 - 1 : 0))
  return rank
}

interface Props {
  nodes: PathNode[]
  paths: FtrPath[]
  height: number
  selectedId: number | null
  onSelect: (node: PathNode | null) => void
}

export default function FtrNetworkGraph({ nodes, paths, height, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<ForceGraphMethods<GNode, GLink>>(undefined)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<number | null>(null)
  const isMobile = useMediaQuery('(max-width:600px)')

  const data = useMemo(() => {
    const ranks = priceRanks(nodes)
    const maxNodeMw = Math.max(1, ...nodes.map((n) => n.totalMw))
    const maxPathMw = Math.max(1, ...paths.map((p) => p.clearedMw))
    const maxMcp = Math.max(1, ...paths.map((p) => Math.abs(p.avgMcp ?? 0)))
    const gNodes: GNode[] = nodes.map((n) => ({
      id: n.pnodeId,
      pnodeId: n.pnodeId,
      name: n.name,
      data: n,
      radius: 3 + 11 * Math.sqrt(n.totalMw / maxNodeMw),
      color: ranks.has(n.pnodeId) ? divergingColor(ranks.get(n.pnodeId)!) : 'rgba(200,210,230,1)',
      hasDa: n.daAvgLmp !== null,
    }))
    const links: GLink[] = paths
      .filter((p) => p.sourcePnodeId !== p.sinkPnodeId)
      .map((p) => ({
        source: p.sourcePnodeId,
        target: p.sinkPnodeId,
        data: p,
        width: 0.6 + 5 * Math.sqrt(p.clearedMw / maxPathMw),
        color: divergingColor((p.avgMcp ?? 0) / maxMcp, 0.55),
      }))
    return { nodes: gNodes, links }
  }, [nodes, paths])

  const neighbours = useMemo(() => {
    const map = new Map<number, Set<number>>()
    for (const p of paths) {
      if (!map.has(p.sourcePnodeId)) map.set(p.sourcePnodeId, new Set())
      if (!map.has(p.sinkPnodeId)) map.set(p.sinkPnodeId, new Set())
      map.get(p.sourcePnodeId)!.add(p.sinkPnodeId)
      map.get(p.sinkPnodeId)!.add(p.sourcePnodeId)
    }
    return map
  }, [paths])

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
    g.d3Force('charge')?.strength(isMobile ? -40 : -70)
    g.d3Force('link')?.distance(isMobile ? 35 : 50)
    // Pull separate clusters towards the middle so small groups don't drift off screen.
    g.d3Force('x', forceX(0).strength(0.06))
    g.d3Force('y', forceY(0).strength(0.06))
    const t = setTimeout(() => g.zoomToFit(600, isMobile ? 16 : 40), 1200)
    return () => clearTimeout(t)
  }, [data, isMobile])

  const focus = hover ?? selectedId
  const lit = (id: number) => focus === null || focus === id || !!neighbours.get(focus)?.has(id)
  const endId = (end: GLink['source']) => (typeof end === 'object' ? (end as GNode).pnodeId : Number(end))
  const linkLit = (l: GLink) => focus === null || endId(l.source) === focus || endId(l.target) === focus

  return (
    <Box ref={containerRef} sx={{ width: '100%', height, touchAction: 'none' }}>
      <ForceGraph2D<GNode, GLink>
        ref={graphRef}
        width={width}
        height={height}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={Infinity}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        linkColor={(l) => (linkLit(l) ? l.color : 'rgba(120,140,170,0.05)')}
        linkWidth={(l) => (linkLit(l) ? l.width : 0.4)}
        linkCurvature={0.15}
        linkDirectionalArrowLength={(l) => (linkLit(l) ? 3 + l.width : 0)}
        linkDirectionalArrowRelPos={0.92}
        linkDirectionalArrowColor={(l) => l.color}
        linkDirectionalParticles={(l) => (linkLit(l) ? Math.min(5, 1 + Math.round(l.width)) : 0)}
        linkDirectionalParticleSpeed={(l) => 0.003 + l.width / 900}
        linkDirectionalParticleWidth={(l) => 1.2 + l.width / 3}
        linkDirectionalParticleColor={() => '#e8f6ff'}
        linkLabel={(l) =>
          `${l.data.sourceNode} → ${l.data.sinkNode}<br/>Cleared ${l.data.clearedMw.toFixed(1)} MW · net ${l.data.netMw.toFixed(1)} MW` +
          (l.data.avgMcp !== null ? `<br/>Avg MCP $${l.data.avgMcp.toFixed(2)}` : '') +
          (l.data.daSpread !== null ? `<br/>DA congestion spread $${l.data.daSpread.toFixed(2)}/MWh` : '')
        }
        onNodeHover={(n) => setHover(n ? n.pnodeId : null)}
        onNodeClick={(n) => onSelect(n.data)}
        onBackgroundClick={() => onSelect(null)}
        nodeLabel={(n) =>
          `${n.name} (${n.pnodeId})<br/>${n.data.totalMw.toFixed(1)} MW in shown paths` +
          (n.data.nodalPrice !== null ? `<br/>Auction nodal price $${n.data.nodalPrice.toLocaleString()}` : '') +
          (n.data.daAvgLmp !== null ? `<br/>DA avg LMP $${n.data.daAvgLmp.toFixed(2)} · congestion $${n.data.daAvgCongestion!.toFixed(2)}` : '')
        }
        nodePointerAreaPaint={(n, color, ctx) => {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, n.radius + 3, 0, 2 * Math.PI)
          ctx.fill()
        }}
        nodeCanvasObject={(n, ctx, scale) => {
          const on = lit(n.pnodeId)
          ctx.save()
          ctx.globalAlpha = on ? 1 : 0.15
          ctx.shadowColor = n.color
          ctx.shadowBlur = on ? 14 : 0
          ctx.fillStyle = n.color
          ctx.beginPath()
          ctx.arc(n.x!, n.y!, n.radius, 0, 2 * Math.PI)
          ctx.fill()
          if (n.hasDa || n.pnodeId === selectedId) {
            ctx.shadowBlur = 0
            ctx.lineWidth = n.pnodeId === selectedId ? 2.5 : 1.2
            ctx.strokeStyle = n.pnodeId === selectedId ? '#ffffff' : 'rgba(127,220,255,0.9)'
            ctx.beginPath()
            ctx.arc(n.x!, n.y!, n.radius + 2.5, 0, 2 * Math.PI)
            ctx.stroke()
          }
          const showLabel = n.radius > 8 || n.pnodeId === focus || (focus !== null && on) || scale > 2.5
          if (showLabel) {
            const fontSize = Math.max(10 / scale, 3)
            ctx.font = `600 ${fontSize}px Inter, Segoe UI, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = 'rgba(230,240,255,0.92)'
            ctx.fillText(n.name, n.x!, n.y! + n.radius + 3)
          }
          ctx.restore()
        }}
      />
    </Box>
  )
}
