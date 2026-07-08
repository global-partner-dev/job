import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { token } from '../../lib/palette'

/** Shown when the user is signed in but not yet approved (pending / rejected). */
export default function AccountStatus() {
  const { profile, session, signOut, refreshProfile } = useAuth()
  const [checking, setChecking] = useState(false)
  const rejected = profile?.status === 'rejected'
  const email = profile?.email || session?.user?.email || ''

  const recheck = async () => {
    setChecking(true)
    try {
      await refreshProfile()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card w-full max-w-md p-8 text-center animate-fade-in">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{
            backgroundColor: token(rejected ? 'danger' : 'warning', 0.14),
            color: token(rejected ? 'danger' : 'warning'),
          }}
        >
          {rejected ? '✕' : '⏳'}
        </div>
        <h1 className="mt-4 text-xl font-semibold text-content">
          {rejected ? 'Access declined' : 'Waiting for approval'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {rejected
            ? 'An administrator has declined access for this account. Contact your admin if you think this is a mistake.'
            : 'Your account was created and is pending administrator approval. You’ll get access as soon as an admin approves it.'}
        </p>
        {email && <p className="mt-3 text-xs text-subtle">Signed in as {email}</p>}

        <div className="mt-6 flex justify-center gap-2">
          {!rejected && (
            <button className="btn btn-primary" onClick={recheck} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </button>
          )}
          <button className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
