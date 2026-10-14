import { useState, type FormEvent } from 'react'
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import { errorMessage } from '../api/client'
import AuthCard from './AuthCard'

export default function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await register(fullName, email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="An administrator will assign your role">
      <Stack component="form" spacing={2} onSubmit={submit}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required helperText="At least 8 characters, with upper and lower case letters and a digit" autoComplete="new-password" />
        <TextField label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          {busy ? 'Creating account…' : 'Register'}
        </Button>
        <Typography variant="body2" textAlign="center">
          Already registered?{' '}
          <Link component={RouterLink} to="/login">Sign in</Link>
        </Typography>
      </Stack>
    </AuthCard>
  )
}
