import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Autocomplete, Box, TextField, Typography } from '@mui/material'
import { api } from '../api/client'
import type { NodeMatch } from '../api/types'

const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

interface Props {
  label: string
  role: 'source' | 'sink'
  auctionId: number | undefined
  /** The node chosen at the other end; only nodes with a path to/from it are offered. */
  otherPnodeId?: number
  value: NodeMatch | null
  onChange: (node: NodeMatch | null) => void
}

/** Searchable source or sink picker (by name or PNODEID). */
export default function NodePicker({ label, role, auctionId, otherPnodeId, value, onChange }: Props) {
  const [input, setInput] = useState('')
  const search = useQuery({
    queryKey: ['node-search', auctionId, role, otherPnodeId, input],
    enabled: !!auctionId,
    staleTime: 60_000,
    queryFn: async () =>
      (await api.get<NodeMatch[]>('/network/nodes', { params: { auctionId, q: input, role, otherPnodeId } })).data,
  })

  return (
    <Autocomplete
      size="small"
      options={search.data ?? []}
      value={value}
      onChange={(_, v) => onChange(v)}
      inputValue={input}
      onInputChange={(_, v, reason) => reason !== 'reset' && setInput(v)}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.pnodeId === b.pnodeId}
      loading={search.isFetching}
      noOptionsText={otherPnodeId ? `No ${role} with a path to the chosen node` : 'No matching nodes'}
      renderOption={(props, o) => (
        <li {...props} key={o.pnodeId}>
          <Box>
            <Typography variant="body2">{o.name}</Typography>
            <Typography variant="caption" color="text.secondary">{o.pnodeId} · {fmt.format(o.totalMw)} MW</Typography>
          </Box>
        </li>
      )}
      renderInput={(params) => <TextField {...params} label={label} placeholder="Name or PNODEID" />}
    />
  )
}
