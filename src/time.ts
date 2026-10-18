/**
 * Wall-clock formatting for anchor headers.
 *
 * Anchors render the same ISO-shaped timestamp DSH's durable time-context
 * readings use: local date and time fields, a numeric UTC offset, and the IANA
 * zone label in brackets, with sub-second precision dropped. A reader therefore
 * never has to convert between two clock conventions to compare an anchor with
 * the current turn's reading.
 *
 * @module dsh-lossless-anchors/time
 */

/** Cached formatters, one per zone; `Intl.DateTimeFormat` construction is not free. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

/** Memoized process zone; resolved once per process. */
let PROCESS_ZONE: string | undefined

/**
 * Zone used when a message carries none: the host process zone.
 *
 * @returns The runtime's IANA zone, or `UTC` when the runtime reports none.
 */
export function systemTimeZone(): string {
  PROCESS_ZONE ??= new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return PROCESS_ZONE
}

/**
 * Test whether the runtime accepts `zone` as an IANA time zone.
 *
 * @param zone - candidate zone label.
 * @returns true when a formatter can be built for it.
 */
export function isValidTimeZone(zone: string): boolean {
  try {
    formatter(zone)
    return true
  } catch {
    return false
  }
}

/**
 * Format one epoch millisecond value as `<iso>±HH:MM[<zone>]`.
 *
 * An unknown `zone` falls back to `fallback` (then the process zone, then UTC)
 * instead of failing a request; the bracketed label is always the zone actually
 * used.
 *
 * @param time - epoch milliseconds.
 * @param zone - IANA zone to display in, or a label to fall back from.
 * @param fallback - zone used when `zone` is unusable; defaults to the process zone.
 * @returns the anchor-header timestamp.
 */
export function formatAnchorTimestamp(
  time: number,
  zone: string,
  fallback: string = systemTimeZone(),
): string {
  if (isValidTimeZone(zone)) return render(time, zone)
  if (isValidTimeZone(fallback)) return render(time, fallback)
  return render(time, 'UTC')
}

/** Cached formatter for `zone`; throws `RangeError` for an unknown zone. */
function formatter(zone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(zone)
  if (cached !== undefined) return cached
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  })
  FORMATTERS.set(zone, created)
  return created
}

/** Assemble the durable text from one formatter's parts. */
function render(time: number, zone: string): string {
  const parts = formatter(zone).formatToParts(time)
  const field = (type: string): string => parts.find(part => part.type === type)?.value ?? ''
  return `${field('year')}-${field('month')}-${field('day')}`
    + `T${field('hour')}:${field('minute')}:${field('second')}`
    + `${offsetOf(field('timeZoneName'))}[${zone}]`
}

/**
 * Turn the formatter's `GMT±HH:MM` zone name into an ISO offset.
 *
 * Bare `GMT` (and runtimes that spell it `UTC`) is `+00:00`; an unexpected name
 * degrades to `+00:00` rather than emitting a malformed offset.
 */
function offsetOf(name: string): string {
  return /^GMT([+-]\d{2}:\d{2})$/.exec(name)?.[1] ?? '+00:00'
}
