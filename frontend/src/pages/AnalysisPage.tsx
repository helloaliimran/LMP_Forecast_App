import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import ReactECharts from 'echarts-for-react'
import { api, errorMessage } from '../api/client'
import type { AnalysisPath, AnnualAnalysisOptions, AnnualAnalysisResult, NodeMatch } from '../api/types'
import NodePicker from '../components/NodePicker'
import { baseAxis, C, compactMoney, money } from '../components/charts'

const CLASSES = [
  { value: '24H', label: '24H' },
  { value: 'OnPeak', label: 'On Peak' },
  { value: 'WkndOnPeak', label: 'Wknd On Peak' },
  { value: 'DailyOffPeak', label: 'Daily Off Peak' },
]
const classLabel = (c: string) => CLASSES.find((x) => x.value === c)?.label ?? c

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6" sx={{ color, whiteSpace: 'nowrap' }}>{value}</Typography>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </CardContent>
    </Card>
  )
}

export default function AnalysisPage() {
  const isMobile = useMediaQuery('(max-width:600px)')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [classes, setClasses] = useState<string[]>(['24H'])
  const [round, setRound] = useState<number | 'latest'>('latest')
  const [source, setSource] = useState<NodeMatch | null>(null)
  const [sink, setSink] = useState<NodeMatch | null>(null)
  const [chartClass, setChartClass] = useState('24H')
  const [nodeMetric, setNodeMetric] = useState<'error' | 'compare'>('error')
  // Node prices on their own are measured against different references in the auction and in DA data,
  // so node values are shown as the path from a reference node (default WESTERN HUB) to each node.
  const [refNodeId, setRefNodeId] = useState<number | 'none'>(51288)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const options = useQuery({ queryKey: ['annual-options'], queryFn: async () => (await api.get<AnnualAnalysisOptions>('/analysis/annual/options')).data })

  // Default range: the planning year that holds the latest DA month, up to that month.
  useEffect(() => {
    if (!options.data || from) return
    const last = options.data.daLastMonth ?? new Date().toISOString().slice(0, 7)
    const [y, m] = last.split('-').map(Number)
    const pyStart = m >= 6 ? y : y - 1
    setFrom(`${pyStart}-06`)
    setTo(last)
  }, [options.data, from])

  useEffect(() => {
    if (!classes.includes(chartClass)) setChartClass(classes[0] ?? '24H')
  }, [classes, chartClass])

  const params = {
    from,
    to,
    classes: classes.join(','),
    round: round === 'latest' ? undefined : round,
    sourcePnodeId: source?.pnodeId,
    sinkPnodeId: sink?.pnodeId,
  }
  const valid = !!from && !!to && from <= to && classes.length > 0

  const result = useQuery({
    queryKey: ['annual-analysis', params],
    enabled: valid,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.get<AnnualAnalysisResult>('/analysis/annual', { params })).data,
  })
  const data = result.data
  const pickerAuctionId = options.data?.auctions[0]?.id

  const exportExcel = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const r = await api.get('/analysis/annual/export', { params, responseType: 'blob' })
      const url = URL.createObjectURL(r.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `annual_analysis_${from}_${to}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  // ---- Node error chart ----
  const classNodes = useMemo(() => (data?.nodes ?? []).filter((n) => n.classType === chartClass), [data, chartClass])
  const refNode = refNodeId === 'none' ? undefined : classNodes.find((n) => n.pnodeId === refNodeId)
  const nodeRows = useMemo(
    () =>
      classNodes
        .filter((n) => !refNode || n.pnodeId !== refNode.pnodeId)
        .map((n) =>
          refNode
            ? { ...n, auctionPrice: n.auctionPrice - refNode.auctionPrice, actualPrice: n.actualPrice - refNode.actualPrice, error: n.error - refNode.error }
            : n,
        )
        .sort((a, b) => a.error - b.error),
    [classNodes, refNode],
  )
  const nodeChart = useMemo(() => {
    const names = nodeRows.map((n) => n.name)
    const base = {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 24, top: nodeMetric === 'compare' ? 36 : 12, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (items: { dataIndex: number }[]) => {
          const n = nodeRows[items[0].dataIndex]
          return `<b>${n.name}</b> (${n.pnodeId})<br/>Auction ${money(n.auctionPrice)}<br/>Actual ${money(n.actualPrice)}<br/>Error <b>${money(n.error)}</b><br/>${n.hours.toLocaleString()} h`
        },
      },
      yAxis: { type: 'category', data: names, ...baseAxis, axisLabel: { color: C.muted, fontSize: 11 } },
      xAxis: { type: 'value', ...baseAxis, axisLabel: { color: C.muted, formatter: compactMoney } },
    }
    if (nodeMetric === 'error') {
      return {
        ...base,
        series: [{
          type: 'bar',
          data: nodeRows.map((n) => ({ value: n.error, itemStyle: { color: n.error >= 0 ? C.positive : C.negative, borderRadius: 3 } })),
          barMaxWidth: 14,
        }],
      }
    }
    return {
      ...base,
      legend: { top: 4, textStyle: { color: C.text } },
      series: [
        { name: 'Auction', type: 'bar', data: nodeRows.map((n) => n.auctionPrice), itemStyle: { color: C.auction, borderRadius: 2 }, barMaxWidth: 8 },
        { name: 'Actual', type: 'bar', data: nodeRows.map((n) => n.actualPrice), itemStyle: { color: C.actual, borderRadius: 2 }, barMaxWidth: 8 },
      ],
    }
  }, [nodeRows, nodeMetric])

  // ---- Scatter: auction vs actual per path ----
  const scatterRows = useMemo(() => (data?.paths ?? []).filter((p) => p.classType === chartClass), [data, chartClass])
  const scatterChart = useMemo(() => {
    const vals = scatterRows.flatMap((p) => [p.auctionPrice, p.actualPrice])
    const lo = Math.min(0, ...vals)
    const hi = Math.max(0, ...vals)
    const maxMw = Math.max(1, ...scatterRows.map((p) => p.clearedMw))
    return {
      backgroundColor: 'transparent',
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        formatter: (p: { dataIndex: number; seriesIndex: number }) => {
          if (p.seriesIndex !== 0) return ''
          const r = scatterRows[p.dataIndex]
          return `<b>${r.sourceNode} → ${r.sinkNode}</b><br/>${r.from} to ${r.to}<br/>Auction ${money(r.auctionPrice)}<br/>Actual ${money(r.actualPrice)}<br/>Error <b>${money(r.error)}</b><br/>Cleared ${r.clearedMw.toLocaleString()} MW`
        },
      },
      xAxis: { type: 'value', name: 'Auction $/MW', nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: C.muted }, ...baseAxis, axisLabel: { color: C.muted, formatter: compactMoney } },
      yAxis: { type: 'value', name: 'Actual $/MW', nameTextStyle: { color: C.muted }, ...baseAxis, axisLabel: { color: C.muted, formatter: compactMoney } },
      series: [
        {
          type: 'scatter',
          data: scatterRows.map((p) => [p.auctionPrice, p.actualPrice]),
          symbolSize: (_: unknown, params: { dataIndex: number }) => 6 + 14 * Math.sqrt(scatterRows[params.dataIndex].clearedMw / maxMw),
          itemStyle: {
            color: (params: { dataIndex: number }) => (scatterRows[params.dataIndex].error >= 0 ? C.positive : C.negative),
            opacity: 0.75,
          },
        },
        {
          type: 'line',
          data: [[lo, lo], [hi, hi]],
          symbol: 'none',
          lineStyle: { color: C.muted, type: 'dashed', width: 1 },
          tooltip: { show: false },
          silent: true,
        },
      ],
    }
  }, [scatterRows])

  // ---- Monthly series for the chosen path or node ----
  const seriesRows = useMemo(() => (data?.series ?? []).filter((s) => s.classType === chartClass), [data, chartClass])
  const seriesChart = useMemo(() => ({
    backgroundColor: 'transparent',
    legend: { top: 0, textStyle: { color: C.text } },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => money(v) },
    xAxis: { type: 'category', data: seriesRows.map((s) => s.month), ...baseAxis },
    yAxis: { type: 'value', ...baseAxis, axisLabel: { color: C.muted, formatter: compactMoney } },
    series: [
      { name: 'Auction', type: 'bar', data: seriesRows.map((s) => s.auctionPrice), itemStyle: { color: C.auction, borderRadius: 3 } },
      { name: 'Actual', type: 'bar', data: seriesRows.map((s) => s.actualPrice), itemStyle: { color: C.actual, borderRadius: 3 } },
      { name: 'Error', type: 'line', data: seriesRows.map((s) => s.error), itemStyle: { color: C.text }, lineStyle: { width: 2 }, symbolSize: 7 },
    ],
  }), [seriesRows])

  const columns: GridColDef<AnalysisPath>[] = [
    { field: 'from', headerName: 'From', width: 105 },
    { field: 'to', headerName: 'To', width: 105 },
    { field: 'sourceNode', headerName: 'Source', flex: 1, minWidth: 150 },
    { field: 'sinkNode', headerName: 'Sink', flex: 1, minWidth: 150 },
    { field: 'classType', headerName: 'Class', width: 120, valueFormatter: (v: string) => classLabel(v) },
    { field: 'hours', headerName: 'Hours', type: 'number', width: 80 },
    { field: 'clearedMw', headerName: 'Cleared MW', type: 'number', width: 105 },
    { field: 'auctionPrice', headerName: 'Auction $/MW', type: 'number', width: 130, valueFormatter: (v: number) => money(v) },
    { field: 'actualPrice', headerName: 'Actual $/MW', type: 'number', width: 130, valueFormatter: (v: number) => money(v) },
    {
      field: 'error',
      headerName: 'Error',
      type: 'number',
      width: 130,
      renderCell: ({ value }) => <Box component="span" sx={{ color: value >= 0 ? C.positive : C.negative, fontWeight: 600 }}>{money(value)}</Box>,
    },
    { field: 'auction', headerName: 'Auction', width: 170 },
  ]

  const s = data?.summary
  const nodeChartHeight = Math.max(260, nodeRows.length * (nodeMetric === 'compare' ? 26 : 20) + 40)

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4">Annual auction analysis</Typography>
        <Typography color="text.secondary">
          Auction price versus actual day-ahead congestion for the months you pick. Error = Actual − Auction, in $/MW.
          <Tooltip title="Auction price of a path = sink − source nodal price (Obligation Nodal Prices), prorated by the class hours in the range that have DA data. Actual = sum over those hours of (sink − source) DA congestion. A range that crosses 1 June uses each planning year's own annual auction.">
            <InfoOutlinedIcon fontSize="small" sx={{ ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} />
          </Tooltip>
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 6, sm: 3, md: 1.6 }}>
            <TextField size="small" type="month" label="From" value={from} onChange={(e) => setFrom(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 6, sm: 3, md: 1.6 }}>
            <TextField size="small" type="month" label="To" value={to} onChange={(e) => setTo(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} error={!!from && !!to && to < from} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 'auto' }}>
            <ToggleButtonGroup size="small" value={classes} onChange={(_, v: string[]) => v.length && setClasses(v)} sx={{ flexWrap: 'wrap' }}>
              {CLASSES.map((c) => <ToggleButton key={c.value} value={c.value}>{c.label}</ToggleButton>)}
            </ToggleButtonGroup>
          </Grid>
          <Grid size={{ xs: 12, sm: 3, md: 1.4 }}>
            <TextField select size="small" label="Round" value={round} onChange={(e) => setRound(e.target.value === 'latest' ? 'latest' : Number(e.target.value))} fullWidth>
              <MenuItem value="latest">Latest</MenuItem>
              {options.data?.rounds.map((r) => <MenuItem key={r} value={r}>RD {r}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4.5, md: 2.4 }}>
            <NodePicker label="Source" role="source" auctionId={pickerAuctionId} otherPnodeId={sink?.pnodeId} value={source} onChange={setSource} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4.5, md: 2.4 }}>
            <NodePicker label="Sink" role="sink" auctionId={pickerAuctionId} otherPnodeId={source?.pnodeId} value={sink} onChange={setSink} />
          </Grid>
          <Grid size={{ xs: 12, md: 'grow' }} sx={{ display: 'flex', justifyContent: { md: 'flex-end' } }}>
            <Button variant="contained" startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <FileDownloadIcon />} onClick={exportExcel} disabled={!valid || exporting || !data} fullWidth={isMobile}>
              Export to Excel
            </Button>
          </Grid>
        </Grid>
        {exportError && <Alert severity="error" sx={{ mt: 2 }}>{exportError}</Alert>}
      </Paper>

      {options.isSuccess && options.data.auctions.length === 0 && <Alert severity="info">Upload an annual auction workbook first.</Alert>}
      {result.isError && <Alert severity="error">{errorMessage(result.error)}</Alert>}

      {data && (
        <>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {data.segments.map((seg) => (
              <Chip
                key={seg.planningYear}
                variant="outlined"
                color={seg.auctionId ? (seg.daHours >= seg.calendarHours * 0.98 ? 'success' : 'warning') : 'error'}
                label={`${seg.from} → ${seg.to}: ${seg.auctionLabel ?? 'no annual auction uploaded'} · DA ${Math.round((100 * seg.daHours) / seg.calendarHours)}% of hours`}
              />
            ))}
            {result.isFetching && <CircularProgress size={20} />}
          </Stack>

          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6, md: 2 }}><Kpi label="Paths × classes" value={s!.pathCount.toLocaleString()} hint={s!.truncated ? 'first 5,000 shown; export has all' : undefined} /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><Kpi label="Σ Auction" value={compactMoney(s!.totalAuction)} color={C.auction} /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><Kpi label="Σ Actual" value={compactMoney(s!.totalActual)} color={C.actual} /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><Kpi label="Σ Error" value={compactMoney(s!.totalError)} color={s!.totalError >= 0 ? C.positive : C.negative} /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><Kpi label="Mean |error| per path" value={compactMoney(s!.meanAbsError)} /></Grid>
            <Grid size={{ xs: 6, md: 2 }}><Kpi label="Direction right" value={`${s!.directionHitRate}%`} hint="auction and actual same sign" /></Grid>
          </Grid>

          {classes.length > 1 && (
            <ToggleButtonGroup size="small" exclusive value={chartClass} onChange={(_, v) => v && setChartClass(v)}>
              {classes.map((c) => <ToggleButton key={c} value={c}>Charts: {classLabel(c)}</ToggleButton>)}
            </ToggleButtonGroup>
          )}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1, gap: 1, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="h6">Error by node</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {classLabel(chartClass)} · {refNode ? `path ${refNode.name} → node` : 'raw node values'} · click a bar to use it as the sink
                    </Typography>
                  </Box>
                  <TextField select size="small" label="Relative to" value={refNodeId} onChange={(e) => setRefNodeId(e.target.value === 'none' ? 'none' : Number(e.target.value))} sx={{ minWidth: 170 }}>
                    <MenuItem value="none">None (raw)</MenuItem>
                    {[...classNodes].sort((a, b) => a.name.localeCompare(b.name)).map((n) => <MenuItem key={n.pnodeId} value={n.pnodeId}>{n.name}</MenuItem>)}
                  </TextField>
                  <ToggleButtonGroup size="small" exclusive value={nodeMetric} onChange={(_, v) => v && setNodeMetric(v)}>
                    <ToggleButton value="error">Error</ToggleButton>
                    <ToggleButton value="compare">Auction vs actual</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                {nodeRows.length === 0 ? (
                  <Alert severity="info">No node has both an auction price and DA data in this range.</Alert>
                ) : (
                  <Box sx={{ maxHeight: 640, overflowY: 'auto' }}>
                    <ReactECharts
                      option={nodeChart}
                      notMerge
                      style={{ height: nodeChartHeight, width: '100%' }}
                      onEvents={{
                        click: (e: { dataIndex: number }) => {
                          const n = nodeRows[e.dataIndex]
                          if (refNode) setSource({ pnodeId: refNode.pnodeId, name: refNode.name, totalMw: 0 })
                          setSink({ pnodeId: n.pnodeId, name: n.name, totalMw: 0 })
                        },
                      }}
                    />
                  </Box>
                )}
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6">Auction vs actual by path</Typography>
                <Typography variant="caption" color="text.secondary">
                  {classLabel(chartClass)} · above the dashed line the path earned more than it cost · click a point to drill into that path
                </Typography>
                {scatterRows.length === 0 ? (
                  <Alert severity="info" sx={{ mt: 1 }}>No paths to compare.</Alert>
                ) : (
                  <ReactECharts
                    option={scatterChart}
                    notMerge
                    style={{ height: isMobile ? 320 : 420, width: '100%' }}
                    onEvents={{
                      click: (e: { dataIndex: number; seriesIndex: number }) => {
                        if (e.seriesIndex !== 0) return
                        const p = scatterRows[e.dataIndex]
                        setSource({ pnodeId: p.sourcePnodeId, name: p.sourceNode, totalMw: 0 })
                        setSink({ pnodeId: p.sinkPnodeId, name: p.sinkNode, totalMw: 0 })
                      },
                    }}
                  />
                )}
              </Paper>
            </Grid>
            {data.seriesLabel && seriesRows.length > 0 && (
              <Grid size={12}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="h6">Month by month: {data.seriesLabel}</Typography>
                  <Typography variant="caption" color="text.secondary">{classLabel(chartClass)} · $/MW per month</Typography>
                  <ReactECharts option={seriesChart} notMerge style={{ height: 320, width: '100%' }} />
                </Paper>
              </Grid>
            )}
          </Grid>

          <Box>
            <Typography variant="h6" gutterBottom>Records</Typography>
            <Paper variant="outlined" sx={{ width: '100%', overflowX: 'auto' }}>
              <DataGrid
                rows={data.paths}
                getRowId={(r) => `${r.from}-${r.sourcePnodeId}-${r.sinkPnodeId}-${r.classType}`}
                columns={columns}
                density="compact"
                autoHeight
                showToolbar
                disableRowSelectionOnClick
                pageSizeOptions={[25, 50, 100]}
                initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
                sx={{ border: 0, minWidth: 1100 }}
              />
            </Paper>
          </Box>
        </>
      )}
      {!data && valid && result.isFetching && <Box sx={{ display: 'grid', placeItems: 'center', height: 300 }}><CircularProgress /></Box>}
    </Stack>
  )
}
