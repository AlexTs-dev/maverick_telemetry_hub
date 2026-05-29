// client/src/pages/TripDetailPage.tsx
//
// Shows detail for a single trip — summary stats, sensor charts, DTCs.
// useTrip(id) fetches and caches trip, readings, and dtcs.
// useDiagnose() returns the function to call the Claude API for a DTC.

import { useParams } from 'react-router-dom'
import { useTrip, useDiagnose } from '../contexts/TripContext'

export function TripDetailPage() {
  const { id }                       = useParams<{ id: string }>()
  const { trip, readings, dtcs, loading, error } = useTrip(id!)
  const diagnose                     = useDiagnose()

  if (loading) return null  // replace with your loading state
  if (error)   return null  // replace with your error state
  if (!trip)   return null

  return (
    <div>
      {/*
        Available data:
          trip         — Trip object with all summary stats
          readings     — Reading[] sorted chronologically, use with D3
          dtcs         — DTC[] with optional claude_diagnosis
          diagnose(id) — async fn, calls POST /api/dtcs/:id/diagnose
      */}
    </div>
  )
}
