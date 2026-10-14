import { Box, CircularProgress } from '@mui/material'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '../api/types'
import { useAuth } from './AuthContext'

export default function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading, hasRole } = useAuth()
  const location = useLocation()

  if (loading)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    )
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !hasRole(...roles)) return <Navigate to="/" replace />
  return <Outlet />
}
