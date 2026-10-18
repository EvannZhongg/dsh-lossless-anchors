/**
 * Configuration and defaults for the lossless-anchors plugin.
 *
 * @module dsh-lossless-anchors/config
 */
import z from '@deepseek-ai/schemastery';
/** Default soft budget for the rendered anchor block, in DSH heuristic tokens. */
export declare const DEFAULT_TOKEN_BUDGET = 2000;
/** Minimum accepted soft budget; the rendered header alone costs close to this. */
export declare const MIN_TOKEN_BUDGET = 200;
/** Default hard cap multiplier over the soft budget. */
export declare const HARD_CAP_MULTIPLIER = 1.5;
/** Default maximum number of anchors kept in the projection state. */
export declare const DEFAULT_MAX_ANCHORS = 256;
/** Default maximum number of shadowed turns considered for one request. */
export declare const DEFAULT_MAX_TURNS = 32;
/** Message sources treated as user-authored anchors. */
export declare const DEFAULT_INCLUDE_SOURCES: readonly ["user", "user-question-reply", "user-approval"];
/** Plugin configuration as accepted from `cordis.yml`. */
export interface Config {
    /**
     * Soft budget for the rendered block. When the newest shadowed turn exceeds
     * it, the turn is retained up to `hardMaxTokens` instead.
     *
     * Defaults to 2000. The value uses DSH's fixed 4-characters-per-token
     * heuristic, so CJK text is intentionally conservative only when this value
     * is lowered.
     */
    tokenBudget?: number;
    /**
     * Absolute cap for the rendered block. Defaults to
     * `ceil(tokenBudget * 1.5)`. Must be at least `tokenBudget`.
     */
    hardMaxTokens?: number;
    /** Maximum number of most-recent shadowed turns to consider. Defaults to 32. */
    maxTurns?: number;
    /** Maximum number of anchors retained in projection state. Defaults to 256. */
    maxAnchors?: number;
    /**
     * Message source kinds treated as user-authored input. Defaults to
     * `user`, `user-question-reply`, and `user-approval`.
     */
    includeSources?: string[];
    /**
     * Keep the anchor context when optional runtime context is disabled.
     * Defaults to true.
     */
    required?: boolean;
}
/** Schemastery validation for {@link Config}. */
export declare const Config: z<Config>;
/** Fully resolved plugin configuration. */
export interface ResolvedConfig {
    readonly tokenBudget: number;
    readonly hardMaxTokens: number;
    readonly maxTurns: number;
    readonly maxAnchors: number;
    readonly includeSources: ReadonlySet<string>;
    readonly required: boolean;
}
/** Validate and resolve defaults; invalid values fail plugin load. */
export declare function resolveConfig(input: Config): ResolvedConfig;
