import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar, Avatar, Box, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Menu, MenuItem, Toolbar, Typography, useMediaQuery,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import HubIcon from '@mui/icons-material/Hub'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import QueryStatsIcon from '@mui/icons-material/QueryStats'
import { useAuth } from '../auth/AuthContext'
import type { Role } from '../api/types'

const DRAWER_WIDTH = 240

const NAV: { label: string; path: string; icon: React.ReactNode; roles?: Role[] }[] = [
  { label: 'Welcome', path: '/', icon: <HubIcon /> },
  { label: 'Annual analysis', path: '/analysis', icon: <QueryStatsIcon /> },
  { label: 'Data uploads', path: '/uploads', icon: <CloudUploadIcon />, roles: ['SuperAdmin', 'Admin'] },
  { label: 'Users & roles', path: '/admin/users', icon: <ManageAccountsIcon />, roles: ['SuperAdmin'] },
]

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isDesktop = useMediaQuery('(min-width:900px)')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const drawer = (
    <Box sx={{ pt: 1 }}>
      <Toolbar />
      <List>
        {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map((n) => (
          <ListItemButton
            key={n.path}
            selected={location.pathname === n.path}
            onClick={() => {
              navigate(n.path)
              setMobileOpen(false)
            }}
            sx={{ mx: 1, borderRadius: 2 }}
          >
            <ListItemIcon>{n.icon}</ListItemIcon>
            <ListItemText primary={n.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (t) => t.zIndex.drawer + 1, bgcolor: 'rgba(11,16,32,0.85)', backdropFilter: 'blur(8px)', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar>
          {!isDesktop && (
            <IconButton edge="start" color="inherit" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }} aria-label="Open menu">
              <MenuIcon />
            </IconButton>
          )}
          {isDesktop && <HubIcon color="primary" sx={{ mr: 1 }} />}
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            LMP Forecast
          </Typography>
          {isDesktop && user?.roles.map((r) => <Chip key={r} label={r} size="small" color={r === 'SuperAdmin' ? 'secondary' : 'default'} sx={{ mr: 1 }} />)}
          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Account">
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main' }}>{user?.fullName.charAt(0).toUpperCase()}</Avatar>
          </IconButton>
          <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
            <MenuItem disabled>
              <Box>
                <Typography variant="body2" fontWeight={600}>{user?.fullName}</Typography>
                <Typography variant="caption">{user?.email}</Typography>
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                logout()
                navigate('/login')
              }}
            >
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop || mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider' } }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, sm: 3 }, mt: 8 }}>
        <Outlet />
      </Box>
    </Box>
  )
}
