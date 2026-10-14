import type { ReactNode } from 'react'
import { Box, Paper, Stack, Typography } from '@mui/material'
import HubIcon from '@mui/icons-material/Hub'
import WebBackground from '../components/WebBackground'

export default function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, position: 'relative', overflow: 'hidden' }}>
      <WebBackground />
      <Paper elevation={8} sx={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 }, bgcolor: 'rgba(18,26,46,0.88)', backdropFilter: 'blur(10px)', border: 1, borderColor: 'divider' }}>
        <Stack spacing={1} alignItems="center" sx={{ mb: 3 }}>
          <HubIcon color="primary" sx={{ fontSize: 44 }} />
          <Typography variant="h5">{title}</Typography>
          <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        </Stack>
        {children}
      </Paper>
    </Box>
  )
}
