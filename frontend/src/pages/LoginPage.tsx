import { useState, type FormEvent } from 'react'
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../api/client'
import AuthCard from './AuthCard'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to LMP Forecast">
      <Stack component="form" spacing={2} onSubmit={submit}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <Typography variant="body2" textAlign="center">
          No account yet?{' '}
          <Link component={RouterLink} to="/register">Register</Link>
        </Typography>
      </Stack>
    </AuthCard>
  )
}
