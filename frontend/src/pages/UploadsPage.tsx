import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Paper,
  Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import VisibilityIcon from '@mui/icons-material/Visibility'
import DeleteIcon from '@mui/icons-material/Delete'
import { api, errorMessage } from '../api/client'
import type { AuctionType, UploadBatch, UploadDataType } from '../api/types'
import UploadDropzone from '../components/UploadDropzone'

const AUCTION_TYPES: { value: AuctionType; label: string; period: string }[] = [
  { value: 'Annual', label: 'Annual', period: 'e.g. 2026-2027' },
  { value: 'LongTerm', label: 'Long Term', period: 'e.g. 2026-2029' },
  { value: 'Monthly', label: 'Monthly', period: 'e.g. 2026-10' },
]

/** Pulls the period and round out of names like "annual_2026-2027_round4.xlsx". */
function guessFromFileName(name: string) {
  const period = name.match(/(\d{4}-\d{4}|\d{4}-\d{2})/)?.[1] ?? ''
  const round = name.match(/(?:round|rd)[ _-]?(\d+)/i)?.[1] ?? ''
  return { period, round }
}

function AuctionUpload({ onUploaded }: { onUploaded: (b: UploadBatch) => void }) {
  const [auctionType, setAuctionType] = useState<AuctionType | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [period, setPeriod] = useState('')
  const [round, setRound] = useState('4')
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const chooseFile = (f: File) => {
    setFile(f)
    setResult(null)
    const g = guessFromFileName(f.name)
    if (g.period) setPeriod(g.period)
    if (g.round) setRound(g.round)
    if (!auctionType && /long/i.test(f.name)) setAuctionType('LongTerm')
  }

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.append('File', file!)
      form.append('AuctionType', auctionType!)
      form.append('AuctionPeriod', period)
      form.append('Round', round)
      setProgress(0)
      return (await api.post<UploadBatch>('/uploads/auction', form, { onUploadProgress: (e) => setProgress(e.total ? (e.loaded / e.total) * 100 : null) })).data
    },
    onSuccess: (b) => {
      setResult({ ok: true, text: `Stored ${b.rowCount.toLocaleString()} nodal price rows from "${b.sheetName}" and ${(b.ftrRowCount ?? 0).toLocaleString()} cleared FTRs from the results sheet.` })
      setFile(null)
      onUploaded(b)
    },
    onError: (e) => setResult({ ok: false, text: errorMessage(e) }),
    onSettled: () => setProgress(null),
  })

  const ready = auctionType && file && period.trim() && Number(round) > 0

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography fontWeight={600} gutterBottom>1. Choose the auction type</Typography>
        <ToggleButtonGroup exclusive color="primary" value={auctionType} onChange={(_, v) => v && setAuctionType(v)} sx={{ flexWrap: 'wrap' }}>
          {AUCTION_TYPES.map((t) => (
            <ToggleButton key={t.value} value={t.value} sx={{ px: 3 }}>{t.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box>
        <Typography fontWeight={600} gutterBottom>2. Choose the results workbook</Typography>
        <UploadDropzone
          accept={{ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] }}
          file={file}
          onFile={chooseFile}
          disabled={!auctionType || upload.isPending}
          hint={auctionType ? 'The "Obligation Nodal Prices" and "Results" sheets are read and stored as-is' : 'Choose the auction type first'}
        />
      </Box>

      <Box>
        <Typography fontWeight={600} gutterBottom>3. Check the details</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Auction period" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder={AUCTION_TYPES.find((t) => t.value === auctionType)?.period} disabled={!auctionType} required />
          <TextField label="Round" type="number" value={round} onChange={(e) => setRound(e.target.value)} disabled={!auctionType} slotProps={{ htmlInput: { min: 1, max: 20 } }} required sx={{ width: { sm: 120 } }} />
        </Stack>
      </Box>

      {progress !== null && <LinearProgress variant={progress < 100 ? 'determinate' : 'indeterminate'} value={progress} />}
      {result && <Alert severity={result.ok ? 'success' : 'error'}>{result.text}</Alert>}
      <Box>
        <Button variant="contained" size="large" disabled={!ready || upload.isPending} onClick={() => upload.mutate()}>
          {upload.isPending ? (progress !== null && progress < 100 ? 'Uploading…' : 'Storing rows…') : 'Upload'}
        </Button>
      </Box>
    </Stack>
  )
}

function DaLmpUpload({ onUploaded }: { onUploaded: (b: UploadBatch) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.append('File', file!)
      setProgress(0)
      return (await api.post<UploadBatch>('/uploads/da-lmp', form, { onUploadProgress: (e) => setProgress(e.total ? (e.loaded / e.total) * 100 : null) })).data
    },
    onSuccess: (b) => {
      setResult({ ok: true, text: `Stored ${b.rowCount.toLocaleString()} hourly rows.` })
      setFile(null)
      onUploaded(b)
    },
    onError: (e) => setResult({ ok: false, text: errorMessage(e) }),
    onSettled: () => setProgress(null),
  })

  return (
    <Stack spacing={2.5}>
      <UploadDropzone
        accept={{ 'text/csv': ['.csv'] }}
        file={file}
        onFile={(f) => {
          setFile(f)
          setResult(null)
        }}
        disabled={upload.isPending}
        hint="Day-ahead hourly LMP CSV (datetime_beginning_ept, pnode_id, … total_lmp_da)"
      />
      {progress !== null && <LinearProgress variant={progress < 100 ? 'determinate' : 'indeterminate'} value={progress} />}
      {result && <Alert severity={result.ok ? 'success' : 'error'}>{result.text}</Alert>}
      <Box>
        <Button variant="contained" size="large" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
          {upload.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </Box>
    </Stack>
  )
}

function RowsDialog({ batch, onClose }: { batch: UploadBatch | null; onClose: () => void }) {
  const [page, setPage] = useState({ page: 0, pageSize: 50 })
  const rows = useQuery({
    queryKey: ['rows', batch?.id, page],
    enabled: !!batch,
    queryFn: async () => (await api.get<{ total: number; rows: Record<string, unknown>[] }>(`/uploads/${batch!.id}/rows`, { params: { skip: page.page * page.pageSize, take: page.pageSize } })).data,
  })
  const keys = rows.data?.rows[0] ? Object.keys(rows.data.rows[0]) : []
  const columns: GridColDef[] = keys.map((k) => ({ field: k, headerName: k, flex: 1, minWidth: 130 }))

  return (
    <Dialog open={!!batch} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>{batch?.originalFileName}</DialogTitle>
      <DialogContent sx={{ height: 520 }}>
        <DataGrid
          rows={(rows.data?.rows ?? []).map((r, i) => ({ __id: page.page * page.pageSize + i, ...r }))}
          getRowId={(r) => r.__id as number}
          columns={columns}
          loading={rows.isFetching}
          paginationMode="server"
          rowCount={rows.data?.total ?? 0}
          paginationModel={page}
          onPaginationModelChange={setPage}
          pageSizeOptions={[50, 100, 500]}
          density="compact"
          disableRowSelectionOnClick
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default function UploadsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<UploadDataType>('AuctionNodalPrices')
  const [viewing, setViewing] = useState<UploadBatch | null>(null)
  const [deleting, setDeleting] = useState<UploadBatch | null>(null)

  const history = useQuery({
    queryKey: ['uploads', tab],
    queryFn: async () => (await api.get<UploadBatch[]>('/uploads', { params: { dataType: tab } })).data,
  })
  const remove = useMutation({
    mutationFn: async (id: number) => api.delete(`/uploads/${id}`),
    onSuccess: () => {
      setDeleting(null)
      qc.invalidateQueries({ queryKey: ['uploads'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['uploads'] })
    qc.invalidateQueries({ queryKey: ['summary'] })
    qc.invalidateQueries({ queryKey: ['network'] })
  }

  const columns: GridColDef<UploadBatch>[] = [
    { field: 'originalFileName', headerName: 'File', flex: 1.4, minWidth: 220 },
    ...(tab === 'AuctionNodalPrices'
      ? ([
          { field: 'auctionType', headerName: 'Type', width: 110 },
          { field: 'auctionPeriod', headerName: 'Period', width: 110 },
          { field: 'round', headerName: 'Round', width: 80 },
          { field: 'ftrRowCount', headerName: 'Cleared FTRs', width: 120, type: 'number' },
        ] as GridColDef<UploadBatch>[])
      : []),
    { field: 'rowCount', headerName: tab === 'AuctionNodalPrices' ? 'Nodal rows' : 'Rows', width: 110, type: 'number' },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: ({ row }) => (
        <Tooltip title={row.errorMessage ?? ''}>
          <Chip size="small" label={row.status} color={row.status === 'Completed' ? 'success' : row.status === 'Failed' ? 'error' : 'default'} />
        </Tooltip>
      ),
    },
    { field: 'uploadedBy', headerName: 'By', width: 140 },
    { field: 'uploadedAt', headerName: 'Uploaded', width: 160, valueFormatter: (v: string) => new Date(v).toLocaleString() },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: ({ row }) => (
        <>
          <IconButton size="small" onClick={() => setViewing(row)} disabled={row.status !== 'Completed'} aria-label="View rows"><VisibilityIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={() => setDeleting(row)} aria-label="Delete upload"><DeleteIcon fontSize="small" /></IconButton>
        </>
      ),
    },
  ]

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Data uploads</Typography>
        <Typography color="text.secondary">Files are stored exactly as they are. Analytics come in a later phase.</Typography>
      </Box>

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          <Tab value="AuctionNodalPrices" label="FTR auction results" />
          <Tab value="DaHourlyLmp" label="Day-ahead hourly LMP" />
        </Tabs>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          {tab === 'AuctionNodalPrices' ? <AuctionUpload onUploaded={refresh} /> : <DaLmpUpload onUploaded={refresh} />}
        </Box>
      </Paper>

      <Box>
        <Typography variant="h6" gutterBottom>Upload history</Typography>
        <Paper variant="outlined" sx={{ width: '100%', overflowX: 'auto' }}>
          <DataGrid
            rows={history.data ?? []}
            columns={columns}
            loading={history.isLoading}
            autoHeight
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
            sx={{ border: 0, minWidth: 900 }}
          />
        </Paper>
      </Box>

      <RowsDialog batch={viewing} onClose={() => setViewing(null)} />

      <Dialog open={!!deleting} onClose={() => setDeleting(null)}>
        <DialogTitle>Delete this upload?</DialogTitle>
        <DialogContent>
          <Typography>
            "{deleting?.originalFileName}" and its {deleting?.rowCount.toLocaleString()} stored rows will be removed.
          </Typography>
          {remove.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(remove.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
