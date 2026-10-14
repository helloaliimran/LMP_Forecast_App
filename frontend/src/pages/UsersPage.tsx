import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Box, Card, CardContent, Checkbox, Chip, FormControlLabel, ListItemText, MenuItem, Paper, Select, Snackbar, Stack, Switch, Typography, useMediaQuery } from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { api, errorMessage } from '../api/client'
import type { Role, User } from '../api/types'
import { useAuth } from '../auth/AuthContext'

const ROLES: Role[] = ['SuperAdmin', 'Admin', 'User']

function RolesSelect({ value, onChange }: { value: Role[]; onChange: (roles: Role[]) => void }) {
  return (
    <Select
      multiple
      size="small"
      variant="standard"
      disableUnderline
      value={value}
      onChange={(e) => onChange(e.target.value as Role[])}
      renderValue={(selected) => (
        <Stack direction="row" spacing={0.5}>
          {selected.length === 0 ? <Typography variant="body2" color="text.secondary">No role</Typography> : selected.map((r) => <Chip key={r} label={r} size="small" color={r === 'SuperAdmin' ? 'secondary' : r === 'Admin' ? 'primary' : 'default'} />)}
        </Stack>
      )}
      sx={{ width: '100%' }}
    >
      {ROLES.map((r) => (
        <MenuItem key={r} value={r}>
          <Checkbox checked={value.includes(r)} size="small" />
          <ListItemText primary={r} />
        </MenuItem>
      ))}
    </Select>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)

  const isMobile = useMediaQuery('(max-width:700px)')
  const users = useQuery({ queryKey: ['users'], queryFn: async () => (await api.get<User[]>('/users')).data })

  const onDone = (text: string) => ({
    onSuccess: (updated: User) => {
      qc.setQueryData<User[]>(['users'], (old) => old?.map((u) => (u.id === updated.id ? updated : u)))
      setToast({ ok: true, text })
    },
    onError: (e: unknown) => setToast({ ok: false, text: errorMessage(e) }),
  })

  const setRoles = useMutation({
    mutationFn: async ({ id, roles }: { id: string; roles: Role[] }) => (await api.put<User>(`/users/${id}/roles`, { roles })).data,
    ...onDone('Roles updated'),
  })
  const setActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => (await api.put<User>(`/users/${id}/active`, { isActive })).data,
    ...onDone('Account updated'),
  })

  const columns: GridColDef<User>[] = [
    { field: 'fullName', headerName: 'Name', flex: 1, minWidth: 150 },
    { field: 'email', headerName: 'Email', flex: 1.2, minWidth: 200 },
    {
      field: 'roles',
      headerName: 'Roles',
      flex: 1.3,
      minWidth: 240,
      sortable: false,
      renderCell: ({ row }) => <RolesSelect value={row.roles} onChange={(roles) => setRoles.mutate({ id: row.id, roles })} />,
    },
    {
      field: 'isActive',
      headerName: 'Active',
      width: 90,
      renderCell: ({ row }) => (
        <Switch checked={row.isActive} disabled={row.id === me?.id} onChange={(e) => setActive.mutate({ id: row.id, isActive: e.target.checked })} />
      ),
    },
    { field: 'createdAt', headerName: 'Registered', width: 120, valueFormatter: (v: string) => v?.slice(0, 10) },
  ]

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">Users & roles</Typography>
        <Typography color="text.secondary">New registrations get the User role. Admins can upload data; SuperAdmins also manage users.</Typography>
      </Box>
      {users.isError && <Alert severity="error">{errorMessage(users.error)}</Alert>}
      {isMobile ? (
        <Stack spacing={1.5}>
          {users.data?.map((u) => (
            <Card key={u.id} variant="outlined">
              <CardContent>
                <Typography fontWeight={600}>{u.fullName}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all', mb: 1 }}>{u.email}</Typography>
                <RolesSelect value={u.roles} onChange={(roles) => setRoles.mutate({ id: u.id, roles })} />
                <FormControlLabel
                  sx={{ mt: 1 }}
                  control={<Switch checked={u.isActive} disabled={u.id === me?.id} onChange={(e) => setActive.mutate({ id: u.id, isActive: e.target.checked })} />}
                  label={u.isActive ? 'Active' : 'Disabled'}
                />
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
      <Paper variant="outlined" sx={{ width: '100%', overflowX: 'auto' }}>
        <DataGrid
          rows={users.data ?? []}
          columns={columns}
          loading={users.isLoading}
          autoHeight
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 0, minWidth: 760 }}
        />
      </Paper>
      )}
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)}>
        {toast ? <Alert severity={toast.ok ? 'success' : 'error'} variant="filled">{toast.text}</Alert> : undefined}
      </Snackbar>
    </Stack>
  )
}
