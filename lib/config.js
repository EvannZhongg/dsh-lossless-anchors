/**
 * Configuration and defaults for the lossless-anchors plugin.
 *
 * @module dsh-lossless-anchors/config
 */
import z from '@deepseek-ai/schemastery';
import { isValidTimeZone, systemTimeZone } from './time.js';
/** Default soft budget for the rendered anchor block, in calibrated tokens. */
export const DEFAULT_TOKEN_BUDGET = 2000;
/** Minimum accepted soft budget; the rendered header alone costs close to this. */
export const MIN_TOKEN_BUDGET = 200;
/** Default hard cap multiplier over the soft budget. */
export const HARD_CAP_MULTIPLIER = 1.5;
/** Default characters per token for non-CJK text; matches DSH's fixed heuristic. */
export const DEFAULT_CHARS_PER_TOKEN = 4;
/**
 * Default characters per token for CJK text. DeepSeek's published conversion is
 * about 0.6 tokens per CJK character, i.e. roughly 1.6 characters per token.
 * This is intentionally lower than {@link DEFAULT_CHARS_PER_TOKEN} so a CJK
 * anchor block does not silently become several times its nominal budget.
 */
export const DEFAULT_CJK_CHARS_PER_TOKEN = 1.6;
/** Lower bound for either pricing rate; below this a single character is absurdly expensive. */
export const MIN_CHARS_PER_TOKEN = 0.5;
/** Upper bound for either pricing rate; keeps the calibration from disabling the budget. */
export const MAX_CHARS_PER_TOKEN = 16;
/** Default maximum number of anchors kept in the projection state. */
export const DEFAULT_MAX_ANCHORS = 256;
/** Default maximum number of shadowed turns considered for one request. */
export const DEFAULT_MAX_TURNS = 32;
/** Message sources treated as user-authored anchors. */
export const DEFAULT_INCLUDE_SOURCES = [
    'user',
    'user-question-reply',
    'user-approval',
];
/** Schemastery validation for {@link Config}. */
export const Config = z.object({
    tokenBudget: z.number().step(1).min(MIN_TOKEN_BUDGET).default(DEFAULT_TOKEN_BUDGET),
    hardMaxTokens: z.number().step(1).min(MIN_TOKEN_BUDGET),
    charsPerToken: z.number().min(MIN_CHARS_PER_TOKEN).max(MAX_CHARS_PER_TOKEN).default(DEFAULT_CHARS_PER_TOKEN),
    cjkCharsPerToken: z.number().min(MIN_CHARS_PER_TOKEN).max(MAX_CHARS_PER_TOKEN).default(DEFAULT_CJK_CHARS_PER_TOKEN),
    maxTurns: z.number().step(1).min(1).default(DEFAULT_MAX_TURNS),
    maxAnchors: z.number().step(1).min(1).default(DEFAULT_MAX_ANCHORS),
    includeSources: z.array(z.string()).default([...DEFAULT_INCLUDE_SOURCES]),
    timeZone: z.string(),
    required: z.boolean().default(true),
});
/** Validate and resolve defaults; invalid values fail plugin load. */
export function resolveConfig(input) {
    const tokenBudget = input.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const hardMaxTokens = input.hardMaxTokens ?? Math.ceil(tokenBudget * HARD_CAP_MULTIPLIER);
    requireSafeInteger('tokenBudget', tokenBudget, MIN_TOKEN_BUDGET);
    requireSafeInteger('hardMaxTokens', hardMaxTokens, MIN_TOKEN_BUDGET);
    if (hardMaxTokens < tokenBudget) {
        throw new TypeError(`lossless-anchors: hardMaxTokens (${hardMaxTokens}) must be >= tokenBudget (${tokenBudget})`);
    }
    const charsPerToken = input.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
    const cjkCharsPerToken = input.cjkCharsPerToken ?? DEFAULT_CJK_CHARS_PER_TOKEN;
    requirePricingRate('charsPerToken', charsPerToken);
    requirePricingRate('cjkCharsPerToken', cjkCharsPerToken);
    const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
    const maxAnchors = input.maxAnchors ?? DEFAULT_MAX_ANCHORS;
    requireSafeInteger('maxTurns', maxTurns, 1);
    requireSafeInteger('maxAnchors', maxAnchors, 1);
    const includeSources = new Set(input.includeSources ?? DEFAULT_INCLUDE_SOURCES);
    const timeZone = resolveTimeZone(input.timeZone);
    return {
        tokenBudget,
        hardMaxTokens,
        charsPerToken,
        cjkCharsPerToken,
        maxTurns,
        maxAnchors,
        includeSources,
        timeZone,
        required: input.required ?? true,
    };
}
/** Reject values that cannot be an exact non-negative integer above a floor. */
function requireSafeInteger(name, value, min) {
    if (!Number.isSafeInteger(value) || value < min) {
        throw new TypeError(`lossless-anchors: ${name} must be a safe integer >= ${min}, got ${String(value)}`);
    }
}
/** Reject a pricing rate outside the supported finite range. */
function requirePricingRate(name, value) {
    if (!Number.isFinite(value) || value < MIN_CHARS_PER_TOKEN || value > MAX_CHARS_PER_TOKEN) {
        throw new TypeError(`lossless-anchors: ${name} must be a finite number in `
            + `[${MIN_CHARS_PER_TOKEN}, ${MAX_CHARS_PER_TOKEN}], got ${String(value)}`);
    }
}
/** Resolve the display zone, rejecting a label the runtime cannot format. */
function resolveTimeZone(value) {
    const zone = value ?? systemTimeZone();
    if (!isValidTimeZone(zone)) {
        throw new TypeError(`lossless-anchors: timeZone is not a valid IANA zone: ${JSON.stringify(zone)}`);
    }
    return zone;
}
