import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Grid, IconButton, MenuItem,
  Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import CloseIcon from '@mui/icons-material/Close'
import { api } from '../api/client'
import type { DashboardSummary, FtrPath, NetworkNode, NetworkOptions, NodeMatch, PathNode, PathsResponse } from '../api/types'
import NodePicker from '../components/NodePicker'
import { useAuth } from '../auth/AuthContext'
import FtrNetworkGraph from '../components/FtrNetworkGraph'
import NetworkGraph from '../components/NetworkGraph'
import { demoNodes } from '../components/pjmTopology'

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const money = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? '—' : `$${v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`)
const CLASS_LABELS: Record<string, string> = { '24H': '24H', OnPeak: 'On Peak', WkndOnPeak: 'Wknd On Peak', DailyOffPeak: 'Daily Off Peak' }
const TOP_OPTIONS = [50, 100, 250, 500, 1000]

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h5" sx={{ mt: 0.5, fontSize: { xs: '1.2rem', sm: '1.5rem' }, whiteSpace: 'nowrap' }}>{value}</Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </CardContent>
    </Card>
  )
}

function NodePanel({ node, paths, onClose, onUseAs }: { node: PathNode; paths: FtrPath[]; onClose: () => void; onUseAs: (role: 'source' | 'sink') => void }) {
  const out = paths.filter((p) => p.sourcePnodeId === node.pnodeId).slice(0, 5)
  const inn = paths.filter((p) => p.sinkPnodeId === node.pnodeId).slice(0, 5)
  const row = (p: FtrPath, other: string) => (
    <Stack key={`${p.sourcePnodeId}-${p.sinkPnodeId}`} direction="row" justifyContent="space-between" spacing={1}>
      <Typography variant="body2" noWrap title={other}>{other}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{fmt.format(p.clearedMw)} MW</Typography>
    </Stack>
  )
  return (
    <Card sx={{ position: { xs: 'static', md: 'absolute' }, top: 12, right: 12, width: { md: 320 }, m: { xs: 1, md: 0 }, bgcolor: 'rgba(18,26,46,0.95)', zIndex: 2 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">PNODE {node.pnodeId}</Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.2, wordBreak: 'break-word' }}>{node.name}</Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
        </Stack>
        <Grid container spacing={1} sx={{ my: 1 }}>
          <Grid size={6}><Typography variant="caption" color="text.secondary">MW in shown paths</Typography><Typography fontWeight={600}>{fmt.format(node.totalMw)}</Typography></Grid>
          <Grid size={6}><Typography variant="caption" color="text.secondary">Auction nodal price</Typography><Typography fontWeight={600}>{money(node.nodalPrice)}</Typography></Grid>
          {node.daAvgLmp !== null && (
            <>
              <Grid size={6}><Typography variant="caption" color="text.secondary">DA avg LMP</Typography><Typography fontWeight={600}>{money(node.daAvgLmp)}</Typography></Grid>
              <Grid size={6}><Typography variant="caption" color="text.secondary">DA avg congestion</Typography><Typography fontWeight={600}>{money(node.daAvgCongestion)}</Typography></Grid>
            </>
          )}
        </Grid>
        {out.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary">As source, to</Typography>
            {out.map((p) => row(p, p.sinkNode))}
          </>
        )}
        {inn.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary">As sink, from</Typography>
            {inn.map((p) => row(p, p.sourceNode))}
          </>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button fullWidth variant="outlined" size="small" onClick={() => onUseAs('source')}>Filter as source</Button>
          <Button fullWidth variant="outlined" size="small" onClick={() => onUseAs('sink')}>Filter as sink</Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default function WelcomePage() {
  const { user } = useAuth()
  const isMobile = useMediaQuery('(max-width:600px)')

  const [dateMode, setDateMode] = useState<'month' | 'day'>('month')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [auctionId, setAuctionId] = useState<number | 'auto'>('auto')
  const [classType, setClassType] = useState('All')
  const [hedgeType, setHedgeType] = useState('All')
  const [source, setSource] = useState<NodeMatch | null>(null)
  const [sink, setSink] = useState<NodeMatch | null>(null)
  const [top, setTop] = useState(100)
  const [selected, setSelected] = useState<PathNode | null>(null)

  const summary = useQuery({ queryKey: ['summary'], queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data })
  const options = useQuery({ queryKey: ['network-options'], queryFn: async () => (await api.get<NetworkOptions>('/network/options')).data })

  // Start on the latest month that has day-ahead data, otherwise the current month.
  useEffect(() => {
    if (!options.data || month) return
    const start = options.data.daLastDay ?? new Date().toISOString().slice(0, 10)
    setMonth(start.slice(0, 7))
    setDay(start)
  }, [options.data, month])

  const date = dateMode === 'month' ? month : day
  const hasAuctions = (options.data?.auctions.length ?? 0) > 0

  const paths = useQuery({
    queryKey: ['paths', date, auctionId, classType, hedgeType, source?.pnodeId, sink?.pnodeId, top],
    enabled: hasAuctions && !!date,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await api.get<PathsResponse>('/network/paths', {
          params: {
            date,
            auctionId: auctionId === 'auto' ? undefined : auctionId,
            classType,
            hedgeType,
            sourcePnodeId: source?.pnodeId,
            sinkPnodeId: sink?.pnodeId,
            top,
          },
        })
      ).data,
  })

  const resolvedAuctionId = paths.data?.auction?.id ?? (auctionId === 'auto' ? options.data?.auctions[0]?.id : auctionId)

  // Fallback while no auction results are uploaded: the hub/zone network from day-ahead data.
  const hubNetwork = useQuery({
    queryKey: ['network'],
    enabled: options.isSuccess && !hasAuctions,
    queryFn: async () => (await api.get<{ day: string | null; nodes: NetworkNode[] }>('/dashboard/network')).data,
  })

  const columns: GridColDef<FtrPath>[] = useMemo(
    () => [
      { field: 'sourceNode', headerName: 'Source', flex: 1, minWidth: 180 },
      { field: 'sinkNode', headerName: 'Sink', flex: 1, minWidth: 180 },
      { field: 'clearedMw', headerName: 'Cleared MW', type: 'number', width: 120, valueFormatter: (v: number) => fmt.format(v) },
      { field: 'netMw', headerName: 'Net MW', type: 'number', width: 110, valueFormatter: (v: number) => fmt.format(v) },
      { field: 'ftrCount', headerName: 'FTRs', type: 'number', width: 80 },
      { field: 'avgMcp', headerName: 'Avg MCP $/MW', type: 'number', width: 120, valueFormatter: (v: number | null) => money(v) },
      { field: 'daSpread', headerName: 'DA spread $/MWh', type: 'number', width: 150, valueFormatter: (v: number | null) => money(v) },
    ],
    [],
  )

  const s = summary.data
  const data = paths.data
  const graphHeight = isMobile ? 440 : 600

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Welcome, {user?.fullName.split(' ')[0]}</Typography>
        <Typography color="text.secondary">Cleared FTR paths from source to sink. Pick a month or day, then narrow down by auction, class, hedge type, source or sink.</Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Users" value={s ? fmt.format(s.users) : '…'} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Auction uploads" value={s ? fmt.format(s.auctionUploads) : '…'} hint={s ? `${fmt.format(s.ftrRows)} cleared FTRs` : undefined} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="DA LMP uploads" value={s ? fmt.format(s.daLmpUploads) : '…'} hint={s ? `${fmt.format(s.daLmpRows)} hourly rows` : undefined} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Stat label="Latest DA hour" value={s?.latestDaLmpHour ? s.latestDaLmpHour.slice(0, 10) : '—'} hint={s?.latestDaLmpHour ? `${s.latestDaLmpHour.slice(11, 16)} EPT` : 'No data yet'} /></Grid>
      </Grid>

      {options.isSuccess && !hasAuctions ? (
        <Paper variant="outlined" sx={{ position: 'relative', overflow: 'hidden' }}>
          <Alert severity="info" sx={{ m: 2 }}>Upload an FTR auction workbook to see the source and sink network. Until then this shows PJM hubs and zones from day-ahead data.</Alert>
          <NetworkGraph nodes={hubNetwork.data?.nodes.length ? hubNetwork.data.nodes : demoNodes()} height={graphHeight - 60} />
        </Paper>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 6, md: 3.5 }}>
                <Stack direction="row" spacing={1}>
                  <ToggleButtonGroup size="small" exclusive value={dateMode} onChange={(_, v) => v && setDateMode(v)}>
                    <ToggleButton value="month">Month</ToggleButton>
                    <ToggleButton value="day">Day</ToggleButton>
                  </ToggleButtonGroup>
                  {dateMode === 'month' ? (
                    <TextField size="small" type="month" value={month} onChange={(e) => setMonth(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                  ) : (
                    <TextField size="small" type="date" value={day} onChange={(e) => setDay(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
                  )}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 2.5 }}>
                <TextField select size="small" label="Auction" value={auctionId} onChange={(e) => setAuctionId(e.target.value === 'auto' ? 'auto' : Number(e.target.value))} fullWidth>
                  <MenuItem value="auto">Auto: auction covering the date</MenuItem>
                  {options.data?.auctions.map((a) => <MenuItem key={a.id} value={a.id}>{a.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
                <TextField select size="small" label="Class" value={classType} onChange={(e) => setClassType(e.target.value)} fullWidth>
                  <MenuItem value="All">All</MenuItem>
                  {options.data?.classTypes.map((c) => <MenuItem key={c} value={c}>{CLASS_LABELS[c] ?? c}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
                <TextField select size="small" label="Hedge" value={hedgeType} onChange={(e) => setHedgeType(e.target.value)} fullWidth>
                  <MenuItem value="All">All</MenuItem>
                  {options.data?.hedgeTypes.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4.5 }}>
                <NodePicker
                  label="Source node"
                  role="source"
                  auctionId={resolvedAuctionId}
                  otherPnodeId={sink?.pnodeId}
                  value={source}
                  onChange={(v) => {
                    setSource(v)
                    setSelected(null)
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4.5 }}>
                <NodePicker
                  label="Sink node"
                  role="sink"
                  auctionId={resolvedAuctionId}
                  otherPnodeId={source?.pnodeId}
                  value={sink}
                  onChange={(v) => {
                    setSink(v)
                    setSelected(null)
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 'auto' }}>
                <TextField select size="small" label="Show top" value={top} onChange={(e) => setTop(Number(e.target.value))} sx={{ minWidth: 130 }}>
                  {TOP_OPTIONS.map((t) => <MenuItem key={t} value={t}>{t} paths</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
          </Paper>

          <Paper variant="outlined" sx={{ position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse at center, rgba(79,195,247,0.07), transparent 70%)' }}>
            <Stack direction="row" spacing={1} sx={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1, flexWrap: 'wrap', gap: 1, pointerEvents: 'none' }}>
              {data?.auction && <Chip size="small" color="primary" label={data.auction.label + (data.periodType ? ` · ${data.periodType}` : '')} />}
              {data?.auction && <Chip size="small" variant="outlined" label={`${fmt.format(Math.min(data.paths.length, data.totalPaths))} of ${fmt.format(data.totalPaths)} paths`} />}
              {data?.window && (
                <Chip size="small" variant="outlined" color={data.daNodes ? 'success' : 'default'} label={data.daNodes ? `DA ${data.window.granularity === 'day' ? data.window.start : data.window.start.slice(0, 7)}: ${data.daNodes} nodes priced` : 'No DA prices for these nodes in this period'} />
              )}
              {paths.isFetching && <CircularProgress size={18} />}
            </Stack>
            {data && !data.auction && <Alert severity="warning" sx={{ m: 2, mt: 7 }}>{data.message}</Alert>}
            {data && data.auction && !data.coversDate && <Alert severity="warning" sx={{ m: 2, mt: 7 }}>{data.auction.label} does not cover this date ({data.auction.coverageStart} to {data.auction.coverageEnd}).</Alert>}
            {data?.auction && data.paths.length === 0 && <Alert severity="info" sx={{ m: 2, mt: 7 }}>No paths match these filters.</Alert>}
            {data?.auction && data.paths.length > 0 && (
              <FtrNetworkGraph nodes={data.nodes} paths={data.paths} height={graphHeight} selectedId={selected?.pnodeId ?? null} onSelect={setSelected} />
            )}
            {!data && <Box sx={{ height: graphHeight, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}
            {selected && data && (
              <NodePanel
                node={selected}
                paths={data.paths}
                onClose={() => setSelected(null)}
                onUseAs={(role) => {
                  const picked = { pnodeId: selected.pnodeId, name: selected.name, totalMw: selected.totalMw }
                  if (role === 'source') setSource(picked)
                  else setSink(picked)
                  setSelected(null)
                }}
              />
            )}
            <Stack direction="row" spacing={2} sx={{ px: 2, pb: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Arrows run source → sink · line width = cleared MW</Typography>
              <Typography variant="caption" sx={{ color: '#ff7a3a' }}>● high nodal price / positive MCP</Typography>
              <Typography variant="caption" sx={{ color: '#4fc3f7' }}>● low nodal price / negative MCP</Typography>
              <Typography variant="caption" color="text.secondary">◯ ringed nodes have DA prices</Typography>
            </Stack>
          </Paper>

          {data?.auction && data.paths.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>Paths</Typography>
              <Paper variant="outlined" sx={{ width: '100%', overflowX: 'auto' }}>
                <DataGrid
                  rows={data.paths}
                  getRowId={(r) => `${r.sourcePnodeId}-${r.sinkPnodeId}`}
                  columns={columns}
                  density="compact"
                  autoHeight
                  disableRowSelectionOnClick
                  pageSizeOptions={[10, 25, 100]}
                  initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                  sx={{ border: 0, minWidth: 900 }}
                />
              </Paper>
            </Box>
          )}
        </>
      )}
    </Stack>
  )
}
