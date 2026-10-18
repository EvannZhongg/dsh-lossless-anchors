/**
 * Public data model for the lossless-anchors plugin.
 *
 * An anchor is one user-authored message captured from the Session log. It is
 * "live" while its event is still on the current Session surface; it becomes
 * an anchor once compaction shadows that event.
 *
 * @module dsh-lossless-anchors/types
 */

/** One user-authored message captured from the Session log. */
export interface Anchor {
  /** Durable Session seq of the original `user/message` event. */
  seq: number
  /** Turn that produced the message; 0 before the first observed turn. */
  turn: number
  /** Unix epoch milliseconds of the original event. */
  time: number
  /**
   * Browser IANA zone the message was submitted from, when its source recorded
   * one. Rendering falls back to the configured `timeZone` when absent.
   */
  zone?: string | undefined
  /** Message source kind (`user`, `user-question-reply`, `user-approval`, ...). */
  source: string
  /** Verbatim model-visible text, with media replaced by explicit placeholders. */
  text: string
}

/** Durable per-session projection state. */
export interface AnchorState {
  /** Latest observed turn number. */
  turn: number
  /** Captured anchors in capture order, capped by `maxAnchors`. */
  anchors: Anchor[]
}
