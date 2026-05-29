// client/src/pages/LivePage.tsx
//
// Real-time telemetry view powered by WebSocket + D3.
// useLiveTelemetry() provides everything you need:
//
//   connected     — boolean WebSocket connection state
//   pollerStatus  — 'connected' | 'connecting' | 'disconnected' | 'unknown'
//   lastReading   — most recent LiveReading (for stat displays)
//   readings      — LiveReading[] rolling buffer, max 300 items (5 min at 1Hz)
//                   each item has a `date` Date object for D3 time scales
//   activeTripId  — number | null, current open trip if any
//
// D3 usage pattern for the readings buffer:
//
//   const svgRef = useRef<SVGSVGElement>(null)
//
//   useEffect(() => {
//     if (!svgRef.current || readings.length === 0) return
//     const svg = d3.select(svgRef.current)
//     const x = d3.scaleTime().domain(d3.extent(readings, d => d.date))
//     const y = d3.scaleLinear().domain([0, d3.max(readings, d => d.rpm ?? 0)])
//     // ... draw your chart
//   }, [readings])
//
//   return <svg ref={svgRef} />

import { useLiveTelemetry } from '../contexts/WebSocketContext'

export function LivePage() {
  const {
    connected,
    pollerStatus,
    lastReading,
    readings,
    activeTripId,
  } = useLiveTelemetry()

  return (
    <div>
      {/*
        Your live telemetry UI here.
        readings[] is D3-ready — each item has .date (Date object)
        and all sensor fields from the Reading type.
      */}
    </div>
  )
}
