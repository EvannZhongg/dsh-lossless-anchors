/**
 * Configuration and defaults for the lossless-anchors plugin.
 *
 * @module dsh-lossless-anchors/config
 */
import z from '@deepseek-ai/schemastery';
import { isValidTimeZone, systemTimeZone } from './time.js';
/** Default soft budget for the rendered anchor block, in DSH heuristic tokens. */
export const DEFAULT_TOKEN_BUDGET = 2000;
/** Minimum accepted soft budget; the rendered header alone costs close to this. */
export const MIN_TOKEN_BUDGET = 200;
/** Default hard cap multiplier over the soft budget. */
export const HARD_CAP_MULTIPLIER = 1.5;
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
    const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
    const maxAnchors = input.maxAnchors ?? DEFAULT_MAX_ANCHORS;
    requireSafeInteger('maxTurns', maxTurns, 1);
    requireSafeInteger('maxAnchors', maxAnchors, 1);
    const includeSources = new Set(input.includeSources ?? DEFAULT_INCLUDE_SOURCES);
    const timeZone = resolveTimeZone(input.timeZone);
    return {
        tokenBudget,
        hardMaxTokens,
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
/** Resolve the display zone, rejecting a label the runtime cannot format. */
function resolveTimeZone(value) {
    const zone = value ?? systemTimeZone();
    if (!isValidTimeZone(zone)) {
        throw new TypeError(`lossless-anchors: timeZone is not a valid IANA zone: ${JSON.stringify(zone)}`);
    }
    return zone;
}
