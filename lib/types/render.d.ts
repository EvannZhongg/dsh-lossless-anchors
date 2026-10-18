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
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import { type ResolvedConfig } from './config.js';
import type { Anchor, AnchorState } from './types.js';
/** Stable block preamble. Deliberately says "historical", not "new request". */
export declare const ANCHOR_HEADER: string;
/** Appended to one anchor whose text had to be cut by the hard cap. */
export declare const ANCHOR_TRUNCATION_MARKER = "\n\u2026 [anchor truncated; full text remains in session log]";
/** Budget accounting for one rendered selection. */
export interface RenderMeta {
    /** True when at least one anchor was elided or one text was truncated. */
    readonly truncated: boolean;
    /** Older anchors dropped from an oversized turn. */
    readonly elidedAnchors: number;
    /** Anchor texts cut by the applicable budget cap. */
    readonly truncatedAnchors: number;
}
/** One selected anchor window ready for the PromptContext provider. */
export interface SelectionResult {
    readonly text: string;
    readonly anchors: readonly Anchor[];
    readonly estimatedTokens: number;
    readonly meta: RenderMeta;
}
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
export declare function messageText(message: UserMessage): string;
/**
 * Whether a Unicode code point is normally tokenized as CJK text. The ranges
 * cover CJK radicals and punctuation, kana, Hangul, unified/compatibility
 * ideographs, fullwidth forms, and the supplementary ideographic planes.
 *
 * @param codePoint - Unicode scalar value.
 * @returns true for a CJK-family code point.
 */
export declare function isCjkCodePoint(codePoint: number): boolean;
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
export declare function estimateTextTokens(text: string, charsPerToken?: number, cjkCharsPerToken?: number): number;
/**
 * Render an anchor block. Text is emitted verbatim; only headers, delimiters,
 * and explicit truncation markers are added.
 *
 * @param anchors - anchors in chronological order.
 * @param meta - truncation accounting to disclose.
 * @param fallbackTimeZone - zone used for an anchor that recorded none.
 * @returns rendered block, or `''` when there are no anchors.
 */
export declare function formatAnchors(anchors: readonly Anchor[], meta?: RenderMeta, fallbackTimeZone?: string): string;
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
export declare function selectAnchors(state: AnchorState, surfaceSeqs: readonly number[], config: ResolvedConfig): SelectionResult;
