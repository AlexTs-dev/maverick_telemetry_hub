// client/src/pages/DiagnosticsPage.tsx
//
// Shows all DTCs across all trips.
// Fetches from GET /api/dtcs directly — not via TripContext
// since this is a cross-trip view.
//
// useDiagnose() from TripContext handles the Claude API call.

import { useEffect, useState } from 'react'
import { useDiagnose, type DTC } from '../contexts/TripContext'

export function DiagnosticsPage() {
  const [dtcs,    setDtcs]    = useState<DTC[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const diagnose              = useDiagnose()

  useEffect(() => {
    setLoading(true)
    fetch('/api/dtcs')
      .then(r => r.json())
      .then(setDtcs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null  // replace with your loading state
  if (error)   return null  // replace with your error state

  return (
    <div>
      {/*
        dtcs[]         — all DTCs across all trips
        diagnose(id)   — async fn, calls Claude API, updates local state
        Each DTC has:
          code, first_seen_at, claude_diagnosis (null until diagnosed),
          diagnosed_at, trip_started_at
      */}
    </div>
  )
}
