import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { token } from '../../lib/palette'
import type { Profile, UserStatus } from '../../types'

const STATUS_STYLE: Record<UserStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  approved: { label: 'Approved', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

const RANK: Record<UserStatus, number> = { pending: 0, approved: 1, rejected: 2 }

export default function AdminPanel() {
  const { profile: me } = useAuth()
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else {
      setError(null)
      setRows((data as Profile[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const patch = async (id: string, changes: Partial<Pick<Profile, 'status' | 'role'>>) => {
    setBusyId(id)
    const { error } = await supabase.from('profiles').update(changes).eq('id', id)
    if (error) setError(error.message)
    else {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)))
    }
    setBusyId(null)
  }

  const sorted = useMemo(
    () =>
      rows.slice().sort((a, b) => {
        const r = RANK[a.status] - RANK[b.status]
        return r !== 0 ? r : (a.created_at < b.created_at ? 1 : -1)
      }),
    [rows],
  )

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 }
    for (const r of rows) c[r.status]++
    return c
  }, [rows])

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-tile" style={{ padding: '1rem' }}>
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: token('warning') }}>{counts.pending}</div>
        </div>
        <div className="stat-tile" style={{ padding: '1rem' }}>
          <div className="stat-label">Approved</div>
          <div className="stat-value" style={{ color: token('success') }}>{counts.approved}</div>
        </div>
        <div className="stat-tile" style={{ padding: '1rem' }}>
          <div className="stat-label">Total users</div>
          <div className="stat-value">{rows.length}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="panel-header">
          <div>
            <h3 className="card-title">Users</h3>
            <p className="card-sub">Approve or decline access</p>
          </div>
          <button className="btn btn-ghost text-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {error && (
          <p className="px-5 py-3 text-sm text-danger">{error}</p>
        )}

        <div className="overflow-x-auto">
          <table className="table-admin">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-subtle">No users yet.</td>
                </tr>
              )}
              {sorted.map((u) => {
                const s = STATUS_STYLE[u.status]
                const isMe = u.id === me?.id
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium text-content">{u.full_name || '—'}</div>
                      <div className="text-xs text-subtle">{u.email}</div>
                    </td>
                    <td>
                      <span className="chip">{u.role}</span>
                    </td>
                    <td>
                      <span
                        className="pill"
                        style={{ backgroundColor: token(s.tone, 0.14), color: token(s.tone) }}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="text-xs text-muted">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1.5">
                        {u.status !== 'approved' && (
                          <button
                            className="btn btn-primary px-2 py-1 text-xs"
                            disabled={busyId === u.id}
                            onClick={() => patch(u.id, { status: 'approved' })}
                          >
                            Approve
                          </button>
                        )}
                        {u.status !== 'rejected' && !isMe && (
                          <button
                            className="btn px-2 py-1 text-xs"
                            disabled={busyId === u.id}
                            onClick={() => patch(u.id, { status: 'rejected' })}
                          >
                            Decline
                          </button>
                        )}
                        {!isMe && (
                          <button
                            className="btn btn-ghost px-2 py-1 text-xs"
                            disabled={busyId === u.id}
                            onClick={() =>
                              patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })
                            }
                          >
                            {u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
