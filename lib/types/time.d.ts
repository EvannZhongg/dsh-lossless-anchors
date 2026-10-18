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
/**
 * Zone used when a message carries none: the host process zone.
 *
 * @returns The runtime's IANA zone, or `UTC` when the runtime reports none.
 */
export declare function systemTimeZone(): string;
/**
 * Test whether the runtime accepts `zone` as an IANA time zone.
 *
 * @param zone - candidate zone label.
 * @returns true when a formatter can be built for it.
 */
export declare function isValidTimeZone(zone: string): boolean;
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
export declare function formatAnchorTimestamp(time: number, zone: string, fallback?: string): string;
