// client/src/pages/TripListPage.tsx
//
// Lists all trips from the REST API.
// useTrips() provides trips, loading, error, and refresh.

import { useTrips } from '../contexts/TripContext'

export function TripListPage() {
  const { trips, loading, error, refresh } = useTrips()

  if (loading) return null  // replace with your loading state
  if (error)   return null  // replace with your error state

  return (
    <div>
      {/* Your trip list UI here */}
      {trips.map(trip => (
        <div key={trip.id}>
          {/* trip.started_at, trip.duration_seconds, trip.avg_fuel_economy_mpg, etc */}
        </div>
      ))}
    </div>
  )
}
