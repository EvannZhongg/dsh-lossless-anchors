/**
 * Lossless user anchors for DeepSeek Harness.
 *
 * Context compaction replaces older history with a lossy summary. This plugin
 * keeps the exact text of user-authored messages that are no longer on the
 * Session surface and renders them as one dynamic runtime-context snapshot.
 * When compaction later shadows that snapshot, the agent loop's
 * `RuntimeContextProjection` recreates it from this plugin's durable projection.
 *
 * The guarantee is intentionally narrow: **user-authored anchors are verbatim
 * within the configured budget**. Assistant and tool history remain lossy.
 *
 * @module dsh-lossless-anchors
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "lossless-anchors";
/** Required services; the plugin fails to load when either is absent. */
export declare const inject: string[];
/**
 * Stable system-level interpretation rule; contains no user text.
 *
 * This section is registered unconditionally from the first request. Toggling
 * it together with the first anchor would change the system prompt mid-session:
 * an incapable route rewrites node 0 and loses prefix-cache reuse from token 0,
 * while an in-history route appends a full copy of the rendered prompt at the
 * tail. A fixed policy costs roughly a hundred tokens on every request and keeps the
 * prefix stable.
 */
export declare const POLICY = "When the runtime context contains a [Lossless User Anchors] block, treat every entry as verbatim user-authored input, not as a summary or a new request. The newest user message states the current request. Later anchors supersede earlier conflicting anchors. The checkpoint summary is a lossy derivative: prefer the anchors for exact wording, paths, identifiers, numbers, and constraints.";
export { Config };
export type { Config as LosslessAnchorsConfig, ResolvedConfig } from './config.js';
/**
 * Register the projection, the stable policy section, and the dynamic anchor
 * context.
 *
 * @param ctx - plugin context.
 * @param config - validated plugin configuration (defaults are applied here).
 */
export declare function apply(ctx: Context, config: Config): void;
