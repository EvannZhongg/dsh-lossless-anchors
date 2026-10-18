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
