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
import type { ResolvedConfig } from './config.js';
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
 * display name and byte count. This mirrors Nosis `historical_content()`.
 *
 * @param message - user message from the Session log.
 * @returns joined text, or `''` when the message carries no textual content.
 */
export declare function messageText(message: UserMessage): string;
/**
 * Price rendered text with the same fixed heuristic DSH uses for a user
 * message: one text block plus role framing.
 *
 * @param text - rendered anchor block.
 * @returns heuristic token count.
 */
export declare function estimateTextTokens(text: string): number;
/**
 * Render an anchor block. Text is emitted verbatim; only headers, delimiters,
 * and explicit truncation markers are added.
 *
 * @param anchors - anchors in chronological order.
 * @param meta - truncation accounting to disclose.
 * @returns rendered block, or `''` when there are no anchors.
 */
export declare function formatAnchors(anchors: readonly Anchor[], meta?: RenderMeta): string;
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
