/**
 * Configuration and defaults for the lossless-anchors plugin.
 *
 * @module dsh-lossless-anchors/config
 */
import z from '@deepseek-ai/schemastery';
/** Default soft budget for the rendered anchor block, in calibrated tokens. */
export declare const DEFAULT_TOKEN_BUDGET = 2000;
/** Minimum accepted soft budget; the rendered header alone costs close to this. */
export declare const MIN_TOKEN_BUDGET = 200;
/** Default hard cap multiplier over the soft budget. */
export declare const HARD_CAP_MULTIPLIER = 1.5;
/** Default characters per token for non-CJK text; matches DSH's fixed heuristic. */
export declare const DEFAULT_CHARS_PER_TOKEN = 4;
/**
 * Default characters per token for CJK text. DeepSeek's published conversion is
 * about 0.6 tokens per CJK character, i.e. roughly 1.6 characters per token.
 * This is intentionally lower than {@link DEFAULT_CHARS_PER_TOKEN} so a CJK
 * anchor block does not silently become several times its nominal budget.
 */
export declare const DEFAULT_CJK_CHARS_PER_TOKEN = 1.6;
/** Lower bound for either pricing rate; below this a single character is absurdly expensive. */
export declare const MIN_CHARS_PER_TOKEN = 0.5;
/** Upper bound for either pricing rate; keeps the calibration from disabling the budget. */
export declare const MAX_CHARS_PER_TOKEN = 16;
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
     * Defaults to 2000 calibrated tokens: `charsPerToken` for non-CJK text and
     * `cjkCharsPerToken` for CJK text, plus the same block/role framing DSH uses
     * for one user message.
     */
    tokenBudget?: number;
    /**
     * Absolute cap for the rendered block. Defaults to
     * `ceil(tokenBudget * 1.5)`. Must be at least `tokenBudget`.
     */
    hardMaxTokens?: number;
    /**
     * Calibrated characters per token for non-CJK text. Defaults to 4, which is
     * DSH's fixed heuristic. Lower it when the session is dominated by dense
     * code/JSON that providers tokenize more finely than four characters.
     */
    charsPerToken?: number;
    /**
     * Calibrated characters per token for CJK text. Defaults to 1.6 (about
     * 0.6 tokens per CJK character, following DeepSeek's published conversion).
     * Set this to 4 to restore the old "everything is four chars per token"
     * behavior.
     */
    cjkCharsPerToken?: number;
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
     * IANA zone used for anchors whose message recorded no browser zone.
     * Defaults to the host process zone. Rendered timestamps always name the
     * zone they were formatted in.
     */
    timeZone?: string;
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
    readonly charsPerToken: number;
    readonly cjkCharsPerToken: number;
    readonly maxTurns: number;
    readonly maxAnchors: number;
    readonly includeSources: ReadonlySet<string>;
    readonly timeZone: string;
    readonly required: boolean;
}
/** Validate and resolve defaults; invalid values fail plugin load. */
export declare function resolveConfig(input: Config): ResolvedConfig;
