import { useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import Icon from '../ui/Icon'
import { token } from '../../lib/palette'

type Mode = 'signin' | 'signup'

export default function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if (!email || !password) {
      setError('Enter your email and password.')
      return
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) setError(error)
      } else {
        const { error, needsEmailConfirm } = await signUp(email, password, fullName)
        if (error) {
          setError(error)
        } else if (needsEmailConfirm) {
          setNotice(
            'Account created. Check your email to confirm, then wait for an admin to approve your access.',
          )
          setMode('signin')
        } else {
          setNotice('Account created — waiting for admin approval.')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: token('primary') }}
          >
            <Icon name="radar" size={22} />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-bold text-content">Workana Radar</div>
            <div className="text-xs text-subtle">job intelligence &amp; auto-bidding</div>
          </div>
        </div>

        <div className="card p-6 animate-fade-in">
          <h1 className="text-lg font-semibold text-content">
            {mode === 'signin' ? 'Sign in' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-subtle">
            {mode === 'signin'
              ? 'Access the dashboard and AskBot.'
              : 'New accounts need admin approval before access.'}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === 'signup' && (
              <div>
                <label className="stat-label">Full name</label>
                <input
                  className="input mt-1"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
            )}
            <div>
              <label className="stat-label">Email</label>
              <input
                className="input mt-1"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="stat-label">Password</label>
              <input
                className="input mt-1"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
                {notice}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-muted">
            {mode === 'signin' ? (
              <>
                No account?{' '}
                <button
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    setMode('signup')
                    setError(null)
                    setNotice(null)
                  }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  className="font-medium text-primary hover:underline"
                  onClick={() => {
                    setMode('signin')
                    setError(null)
                    setNotice(null)
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
