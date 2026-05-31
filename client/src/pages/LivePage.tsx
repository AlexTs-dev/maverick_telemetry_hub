import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useLiveTelemetry } from '@/contexts/WebSocketContext'
import type { LiveReading, PollerStatus } from '@/contexts/WebSocketContext'
import { Badge } from '@/components/ui/badge'
import { cn }   from '@/lib/utils'

// ---------------------------------------------------------------------------
// D3 chart coordinate space — fixed viewBox, SVG scales via preserveAspectRatio
// ---------------------------------------------------------------------------

const VB_W = 380
const VB_H = 120
const M    = { top: 6, right: 10, bottom: 20, left: 40 }
const IW   = VB_W - M.left - M.right  // 330
const IH   = VB_H - M.top  - M.bottom // 94

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, dec = 0, suffix = '') {
  return n != null ? `${n.toFixed(dec)}${suffix}` : '—'
}

// ---------------------------------------------------------------------------
// StatusDot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: PollerStatus }) {
  return (
    <span className={cn(
      'inline-block w-2 h-2 rounded-full shrink-0',
      status === 'connected'    && 'bg-green-500',
      status === 'connecting'   && 'bg-yellow-400 animate-pulse',
      status === 'disconnected' && 'bg-destructive',
      status === 'unknown'      && 'bg-muted-foreground',
    )} />
  )
}

// ---------------------------------------------------------------------------
// StatCell
// ---------------------------------------------------------------------------

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center border-r last:border-r-0',
      accent && 'bg-green-500/10',
    )}>
      <span className={cn(
        'text-2xl font-bold tabular-nums leading-none',
        accent && 'text-green-400',
      )}>
        {value}
      </span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
        {label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LiveChart — D3 line chart, re-uses SVG structure across readings updates
// ---------------------------------------------------------------------------

interface LiveChartProps {
  readings: LiveReading[]
  accessor: (r: LiveReading) => number | null
  color:    string   // CSS var e.g. 'var(--chart-1)'
  label:    string
  unit?:    string
  yDomain?: [number, number]
}

function LiveChart({ readings, accessor, color, label, unit, yDomain }: LiveChartProps) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const initRef  = useRef(false)
  const gRef     = useRef<d3.Selection<SVGGElement,     unknown, null, undefined> | null>(null)
  const xAxisRef = useRef<d3.Selection<SVGGElement,     unknown, null, undefined> | null>(null)
  const yAxisRef = useRef<d3.Selection<SVGGElement,     unknown, null, undefined> | null>(null)
  const pathRef  = useRef<d3.Selection<SVGPathElement,  unknown, null, undefined> | null>(null)
  const clipId   = `clip-${label.replace(/\W+/g, '')}`

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    // One-time SVG structure setup
    if (!initRef.current) {
      initRef.current = true

      svg.append('defs')
        .append('clipPath').attr('id', clipId)
        .append('rect').attr('width', IW).attr('height', IH + 2)

      const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`)
      gRef.current = g

      xAxisRef.current = g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${IH})`)
      yAxisRef.current = g.append('g').attr('class', 'y-axis')

      pathRef.current = g.append('path')
        .attr('fill', 'none')
        .attr('clip-path', `url(#${clipId})`)
        .attr('stroke-width', 1.5)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .style('stroke', color)
    }

    if (readings.length < 2) return
    const valid = readings.filter(r => accessor(r) != null)
    if (valid.length < 2) return

    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(readings, r => r.date) as [Date, Date])
      .range([0, IW])

    const vals  = valid.map(r => accessor(r) as number)
    const rawLo = Math.min(...vals)
    const rawHi = Math.max(...vals)
    const pad   = (rawHi - rawLo) * 0.08 || 1
    const y = d3.scaleLinear()
      .domain(yDomain ?? [rawLo - pad, rawHi + pad])
      .range([IH, 0])
      .nice()

    // Line
    const line = d3.line<LiveReading>()
      .defined(r => accessor(r) != null)
      .x(r => x(r.date))
      .y(r => y(accessor(r) as number))
      .curve(d3.curveMonotoneX)

    pathRef.current?.attr('d', line(readings))

    // Axis styling via inline styles (CSS vars resolve in modern Chrome)
    const fg  = 'var(--muted-foreground)'
    const bdr = 'var(--border)'

    xAxisRef.current
      ?.call(d3.axisBottom(x).ticks(4).tickSize(-IH)
          .tickFormat(d => d3.timeFormat('%M:%S')(d as Date)))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll<SVGLineElement, unknown>('.tick line')
          .style('stroke', bdr).style('stroke-dasharray', '2,3'))
      .call(g => g.selectAll<SVGTextElement, unknown>('.tick text')
          .style('fill', fg).style('font-size', '9px'))

    yAxisRef.current
      ?.call(d3.axisLeft(y).ticks(3).tickSize(-IW))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll<SVGLineElement, unknown>('.tick line')
          .style('stroke', bdr).style('stroke-dasharray', '2,3'))
      .call(g => g.selectAll<SVGTextElement, unknown>('.tick text')
          .style('fill', fg).style('font-size', '9px'))

  }, [readings])

  const hasData = readings.some(r => accessor(r) != null)

  return (
    <div className="rounded-lg border bg-card p-2 flex flex-col gap-1 min-h-0 overflow-hidden">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none px-1 shrink-0">
        {label}{unit && ` · ${unit}`}
      </p>
      {!hasData ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-muted-foreground">
          waiting for data…
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className="w-full flex-1 min-h-0"
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function LivePage() {
  const { pollerStatus, lastReading, readings, activeTripId } = useLiveTelemetry()

  const r    = lastReading
  const isEV = r?.ev_mode === 1

  return (
    <div className="flex flex-col h-screen">

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b shrink-0">
        <div className="flex items-center gap-2">
          <StatusDot status={pollerStatus} />
          <h1 className="text-base font-semibold">Live</h1>
          {activeTripId != null && (
            <span className="text-xs text-muted-foreground">Trip #{activeTripId}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEV && (
            <Badge className="bg-green-500/15 text-green-400 border border-green-500/30 text-xs">
              EV
            </Badge>
          )}
          <Badge variant={pollerStatus === 'connected' ? 'outline' : 'destructive'} className="text-xs">
            {pollerStatus === 'connected'    ? 'Connected'    :
             pollerStatus === 'connecting'   ? 'Connecting…'  :
             pollerStatus === 'disconnected' ? 'Disconnected' : 'Unknown'}
          </Badge>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-5 h-[68px] border-b shrink-0">
        <StatCell label="mph"     value={fmt(r?.speed_mph, 0)} />
        <StatCell label="rpm"     value={fmt(r?.rpm, 0)} />
        <StatCell label="soc"     value={fmt(r?.battery_soc_pct, 0, '%')} />
        <StatCell label="ev mode" value={r != null ? (isEV ? 'ON' : 'OFF') : '—'} accent={isEV} />
        <StatCell label="regen"   value={fmt(r?.regen_kw, 1, ' kW')} />
      </div>

      {/* Charts — 2×2 D3 grid filling remaining space */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-3 min-h-0">
        <LiveChart
          readings={readings}
          accessor={r => r.speed_mph}
          color="var(--chart-1)"
          label="Speed" unit="mph"
          yDomain={[0, 80]}
        />
        <LiveChart
          readings={readings}
          accessor={r => r.battery_soc_pct}
          color="var(--chart-2)"
          label="Battery SOC" unit="%"
          yDomain={[0, 100]}
        />
        <LiveChart
          readings={readings}
          accessor={r => r.rpm}
          color="var(--chart-3)"
          label="Engine RPM"
          yDomain={[0, 4000]}
        />
        <LiveChart
          readings={readings}
          accessor={r => r.pack_voltage_v}
          color="var(--chart-4)"
          label="Pack Voltage" unit="V"
        />
      </div>

    </div>
  )
}
