/**
 * Pure anchor extraction, selection, budgeting, and rendering.
 *
 * The selector receives the current Session surface. An anchor is eligible
 * only when its original `user/message` seq is no longer a surface node, which
 * is exactly "the original was shadowed by a surface replacement" (normally
 * compaction).
 *
 * @module dsh-lossless-anchors/render
 */

import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  DEFAULT_CHARS_PER_TOKEN,
  DEFAULT_CJK_CHARS_PER_TOKEN,
  type ResolvedConfig,
} from './config.js'
import { formatAnchorTimestamp, systemTimeZone } from './time.js'
import type { Anchor, AnchorState } from './types.js'

/** Stable block preamble. Deliberately says "historical", not "new request". */
export const ANCHOR_HEADER = [
  '[Lossless User Anchors]',
  'Verbatim user-authored messages from earlier turns whose originals were condensed away.',
  'These are historical anchors, not a new request. The newest user message states the current request.',
  'Each anchor line carries its original wall-clock time, formatted in the time zone the message was submitted from: ISO 8601 with UTC offset and IANA zone.',
  'Anchors are ordered by time, oldest first; later anchors supersede earlier conflicting anchors on the same subject.',
  'This block supersedes earlier [Lossless User Anchors] blocks.',
].join('\n')

/** Appended to one anchor whose text had to be cut by the hard cap. */
export const ANCHOR_TRUNCATION_MARKER = '\n… [anchor truncated; full text remains in session log]'

/** Budget accounting for one rendered selection. */
export interface RenderMeta {
  /** True when at least one anchor was elided or one text was truncated. */
  readonly truncated: boolean
  /** Older anchors dropped from an oversized turn. */
  readonly elidedAnchors: number
  /** Anchor texts cut by the applicable budget cap. */
  readonly truncatedAnchors: number
}

/** One selected anchor window ready for the PromptContext provider. */
export interface SelectionResult {
  readonly text: string
  readonly anchors: readonly Anchor[]
  readonly estimatedTokens: number
  readonly meta: RenderMeta
}

const EMPTY_META: RenderMeta = Object.freeze({
  truncated: false,
  elidedAnchors: 0,
  truncatedAnchors: 0,
})

/**
 * Extract the text a user message contributed to the model, preserving exact
 * text blocks and replacing non-text media with explicit placeholders.
 *
 * Images are never re-uploaded from historical context; files keep their
 * display name and byte count. Historical media is omitted rather than
 * silently replayed.
 *
 * @param message - user message from the Session log.
 * @returns joined text, or `''` when the message carries no textual content.
 */
export function messageText(message: UserMessage): string {
  const parts: string[] = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        parts.push(block.text)
        break
      case 'image': {
        const { mediaType, width, height } = block.attachment
        parts.push(`[image omitted: ${mediaType}, ${width}x${height}]`)
        break
      }
      case 'file': {
        const { name, bytes } = block.attachment
        parts.push(`[file ${JSON.stringify(name)}, ${bytes} bytes]`)
        break
      }
      default:
        break
    }
  }
  return parts.join('\n')
}

/**
 * Structural price of one text block plus its user-role framing. DSH's meter
 * prices a text block as `ceil(chars / 4) + 4` and a message as content + 4;
 * the calibrated estimate keeps the same framing while varying the character
 * rate.
 */
const FRAMING_OVERHEAD = 8

/**
 * Whether a Unicode code point is normally tokenized as CJK text. The ranges
 * cover CJK radicals and punctuation, kana, Hangul, unified/compatibility
 * ideographs, fullwidth forms, and the supplementary ideographic planes.
 *
 * @param codePoint - Unicode scalar value.
 * @returns true for a CJK-family code point.
 */
export function isCjkCodePoint(codePoint: number): boolean {
  return (codePoint >= 0x2E80 && codePoint <= 0x9FFF)
    || (codePoint >= 0xAC00 && codePoint <= 0xD7AF)
    || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
    || (codePoint >= 0xFE30 && codePoint <= 0xFE4F)
    || (codePoint >= 0xFF00 && codePoint <= 0xFFEF)
    || (codePoint >= 0x20000 && codePoint <= 0x2FA1F)
}

/**
 * Price rendered text with a calibrated characters-per-token rate: non-CJK
 * text uses {@link charsPerToken}, CJK text uses {@link cjkCharsPerToken}.
 * This is deliberately not DSH's fixed four-characters-per-token meter: the
 * point is to keep a CJK anchor block within the provider's real token cost,
 * where four characters per token would underprice it by roughly 2.5x.
 *
 * @param text - rendered anchor block.
 * @param charsPerToken - calibrated rate for non-CJK text.
 * @param cjkCharsPerToken - calibrated rate for CJK text.
 * @returns calibrated token count, including block and role framing.
 */
export function estimateTextTokens(
  text: string,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
  cjkCharsPerToken: number = DEFAULT_CJK_CHARS_PER_TOKEN,
): number {
  let other = 0
  let cjk = 0
  for (const character of text) {
    if (isCjkCodePoint(character.codePointAt(0) ?? 0)) cjk += 1
    else other += 1
  }
  return Math.ceil(other / charsPerToken + cjk / cjkCharsPerToken) + FRAMING_OVERHEAD
}

/**
 * Render an anchor block. Text is emitted verbatim; only headers, delimiters,
 * and explicit truncation markers are added.
 *
 * @param anchors - anchors in chronological order.
 * @param meta - truncation accounting to disclose.
 * @param fallbackTimeZone - zone used for an anchor that recorded none.
 * @returns rendered block, or `''` when there are no anchors.
 */
export function formatAnchors(
  anchors: readonly Anchor[],
  meta: RenderMeta = EMPTY_META,
  fallbackTimeZone: string = systemTimeZone(),
): string {
  if (anchors.length === 0) return ''
  const lines = [ANCHOR_HEADER]
  if (meta.truncated) {
    lines.push(
      `[anchor budget: ${meta.elidedAnchors} older anchor message(s) elided; `
      + `${meta.truncatedAnchors} anchor text(s) truncated to fit the configured budget]`,
    )
  }
  for (const anchor of anchors) {
    const time = formatAnchorTimestamp(anchor.time, anchor.zone ?? fallbackTimeZone, fallbackTimeZone)
    lines.push(
      '',
      `--- turn ${anchor.turn} | ${time} | ${anchor.source} ---`,
      anchor.text,
    )
  }
  return lines.join('\n')
}

/**
 * Select the shadowed anchor window for one request.
 *
 * Newest shadowed turns are considered first. A candidate that fits the soft
 * budget is accepted. The first candidate that does not fit is fitted into the
 * applicable remainder (the hard cap for the newest turn, the remaining soft
 * budget for an older one): its oldest anchors are dropped first, then the
 * newest remaining text is truncated. No turn older than the first fitted
 * candidate is considered.
 *
 * @param state - session projection state.
 * @param surfaceSeqs - current Session surface node seqs.
 * @param config - resolved plugin configuration.
 * @returns rendered text and accounting.
 */
export function selectAnchors(
  state: AnchorState,
  surfaceSeqs: readonly number[],
  config: ResolvedConfig,
): SelectionResult {
  const surface = new Set<number>(surfaceSeqs)
  const shadowed = state.anchors.filter(anchor => !surface.has(anchor.seq))
  if (shadowed.length === 0) {
    return { text: '', anchors: [], estimatedTokens: 0, meta: EMPTY_META }
  }

  const groups = groupByTurn(shadowed).slice(-config.maxTurns)
  const chosen: Anchor[][] = []
  let meta: RenderMeta = EMPTY_META

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    if (group === undefined) continue
    const candidate = [...group, ...chosen.flat()]
    if (estimateTextTokens(
      formatAnchors(candidate, EMPTY_META, config.timeZone),
      config.charsPerToken,
      config.cjkCharsPerToken,
    ) <= config.tokenBudget) {
      chosen.unshift(group)
      continue
    }
    // The group does not fit whole. Keep the newest turn up to the hard cap;
    // for an older turn, fit it into what remains of the soft budget. Either
    // path drops the oldest anchors first and truncates only the final text.
    const chosenTokens = estimateTextTokens(
      formatAnchors(chosen.flat(), EMPTY_META, config.timeZone),
      config.charsPerToken,
      config.cjkCharsPerToken,
    )
    const remaining = chosen.length === 0
      ? config.hardMaxTokens
      // formatAnchors() prices one header; subtract the selected block and add
      // the shared header back so the fitted group is not double-charged.
      // The small safety margin absorbs disclosure-line framing differences.
      : config.tokenBudget - chosenTokens + estimateTextTokens(
        ANCHOR_HEADER,
        config.charsPerToken,
        config.cjkCharsPerToken,
      ) - 16
    const fitted = fitTurn(
      group,
      remaining,
      config.timeZone,
      config.charsPerToken,
      config.cjkCharsPerToken,
    )
    if (fitted.anchors.length > 0) {
      chosen.unshift(fitted.anchors)
      meta = mergeMeta(meta, fitted.meta)
    }
    break
  }

  let anchors = chosen.flat()
  let text = formatAnchors(anchors, meta, config.timeZone)
  let estimatedTokens = estimateTextTokens(text, config.charsPerToken, config.cjkCharsPerToken)
  if (estimatedTokens > config.hardMaxTokens) {
    // Defensive: header growth or a multi-group flatten can exceed the cap even
    // though each accepted group was priced. Re-fit as one bundle.
    const fitted = fitTurn(
      anchors,
      config.hardMaxTokens,
      config.timeZone,
      config.charsPerToken,
      config.cjkCharsPerToken,
    )
    anchors = fitted.anchors
    meta = fitted.meta
    text = formatAnchors(anchors, meta, config.timeZone)
    estimatedTokens = estimateTextTokens(text, config.charsPerToken, config.cjkCharsPerToken)
  }
  return { text, anchors, estimatedTokens, meta }
}

/** Group anchors by turn, chronological within each group. */
function groupByTurn(anchors: readonly Anchor[]): Anchor[][] {
  const byTurn = new Map<number, Anchor[]>()
  for (const anchor of anchors) {
    const group = byTurn.get(anchor.turn)
    if (group === undefined) byTurn.set(anchor.turn, [anchor])
    else group.push(anchor)
  }
  return [...byTurn.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, group]) => [...group].sort((left, right) => left.seq - right.seq))
}

/** Keep a group under `maxTokens` by dropping its oldest anchors, then truncating. */
function fitTurn(
  group: readonly Anchor[],
  maxTokens: number,
  timeZone: string,
  charsPerToken: number,
  cjkCharsPerToken: number,
): { anchors: Anchor[]; meta: RenderMeta } {
  const kept = [...group]
  let elidedAnchors = 0
  while (kept.length > 1) {
    const candidateMeta: RenderMeta = {
      truncated: elidedAnchors > 0,
      elidedAnchors,
      truncatedAnchors: 0,
    }
    if (estimateTextTokens(
      formatAnchors(kept, candidateMeta, timeZone),
      charsPerToken,
      cjkCharsPerToken,
    ) <= maxTokens) break
    kept.shift()
    elidedAnchors += 1
  }
  const keptMeta: RenderMeta = {
    truncated: elidedAnchors > 0,
    elidedAnchors,
    truncatedAnchors: 0,
  }
  if (estimateTextTokens(
    formatAnchors(kept, keptMeta, timeZone),
    charsPerToken,
    cjkCharsPerToken,
  ) <= maxTokens) {
    return { anchors: kept, meta: keptMeta }
  }

  const newest = kept.at(-1)
  if (newest === undefined) {
    return { anchors: [], meta: { truncated: true, elidedAnchors, truncatedAnchors: 0 } }
  }
  const truncatedText = truncateToFit(
    newest.text,
    newest,
    maxTokens,
    elidedAnchors,
    timeZone,
    charsPerToken,
    cjkCharsPerToken,
  )
  if (truncatedText === undefined) {
    return { anchors: [], meta: { truncated: true, elidedAnchors, truncatedAnchors: 0 } }
  }
  return {
    anchors: [{ ...newest, text: truncatedText }],
    meta: { truncated: true, elidedAnchors, truncatedAnchors: 1 },
  }
}

/** Add one fitted group's disclosure counts to the accumulated selection. */
function mergeMeta(left: RenderMeta, right: RenderMeta): RenderMeta {
  return {
    truncated: left.truncated || right.truncated,
    elidedAnchors: left.elidedAnchors + right.elidedAnchors,
    truncatedAnchors: left.truncatedAnchors + right.truncatedAnchors,
  }
}

/** Binary-search the longest text prefix that fits the cap with a marker. */
function truncateToFit(
  text: string,
  anchor: Anchor,
  maxTokens: number,
  elidedAnchors: number,
  timeZone: string,
  charsPerToken: number,
  cjkCharsPerToken: number,
): string | undefined {
  const meta: RenderMeta = { truncated: true, elidedAnchors, truncatedAnchors: 1 }
  const fits = (length: number): boolean => {
    const candidate: Anchor = { ...anchor, text: safeSlice(text, length) + ANCHOR_TRUNCATION_MARKER }
    return estimateTextTokens(
      formatAnchors([candidate], meta, timeZone),
      charsPerToken,
      cjkCharsPerToken,
    ) <= maxTokens
  }
  if (!fits(0)) return undefined
  let low = 0
  let high = text.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (fits(middle)) low = middle
    else high = middle - 1
  }
  return safeSlice(text, low) + ANCHOR_TRUNCATION_MARKER
}

/** Slice without splitting a UTF-16 surrogate pair. */
function safeSlice(text: string, length: number): string {
  let end = Math.max(0, Math.min(length, text.length))
  if (end > 0) {
    const code = text.charCodeAt(end - 1)
    if (code >= 0xD800 && code <= 0xDBFF) end -= 1
  }
  return text.slice(0, end)
}

