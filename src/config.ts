/**
 * Configuration and defaults for the lossless-anchors plugin.
 *
 * @module dsh-lossless-anchors/config
 */

import z from '@deepseek-ai/schemastery'

/** Default soft budget for the rendered anchor block, in DSH heuristic tokens. */
export const DEFAULT_TOKEN_BUDGET = 2000

/** Minimum accepted soft budget; the rendered header alone costs close to this. */
export const MIN_TOKEN_BUDGET = 200

/** Default hard cap multiplier over the soft budget. */
export const HARD_CAP_MULTIPLIER = 1.5

/** Default maximum number of anchors kept in the projection state. */
export const DEFAULT_MAX_ANCHORS = 256

/** Default maximum number of shadowed turns considered for one request. */
export const DEFAULT_MAX_TURNS = 32

/** Message sources treated as user-authored anchors. */
export const DEFAULT_INCLUDE_SOURCES = [
  'user',
  'user-question-reply',
  'user-approval',
] as const

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
  tokenBudget?: number
  /**
   * Absolute cap for the rendered block. Defaults to
   * `ceil(tokenBudget * 1.5)`. Must be at least `tokenBudget`.
   */
  hardMaxTokens?: number
  /** Maximum number of most-recent shadowed turns to consider. Defaults to 32. */
  maxTurns?: number
  /** Maximum number of anchors retained in projection state. Defaults to 256. */
  maxAnchors?: number
  /**
   * Message source kinds treated as user-authored input. Defaults to
   * `user`, `user-question-reply`, and `user-approval`.
   */
  includeSources?: string[]
  /**
   * Keep the anchor context when optional runtime context is disabled.
   * Defaults to true.
   */
  required?: boolean
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  tokenBudget: z.number().step(1).min(MIN_TOKEN_BUDGET).default(DEFAULT_TOKEN_BUDGET),
  hardMaxTokens: z.number().step(1).min(MIN_TOKEN_BUDGET),
  maxTurns: z.number().step(1).min(1).default(DEFAULT_MAX_TURNS),
  maxAnchors: z.number().step(1).min(1).default(DEFAULT_MAX_ANCHORS),
  includeSources: z.array(z.string()).default([...DEFAULT_INCLUDE_SOURCES]),
  required: z.boolean().default(true),
})

/** Fully resolved plugin configuration. */
export interface ResolvedConfig {
  readonly tokenBudget: number
  readonly hardMaxTokens: number
  readonly maxTurns: number
  readonly maxAnchors: number
  readonly includeSources: ReadonlySet<string>
  readonly required: boolean
}

/** Validate and resolve defaults; invalid values fail plugin load. */
export function resolveConfig(input: Config): ResolvedConfig {
  const tokenBudget = input.tokenBudget ?? DEFAULT_TOKEN_BUDGET
  const hardMaxTokens = input.hardMaxTokens ?? Math.ceil(tokenBudget * HARD_CAP_MULTIPLIER)
  requireSafeInteger('tokenBudget', tokenBudget, MIN_TOKEN_BUDGET)
  requireSafeInteger('hardMaxTokens', hardMaxTokens, MIN_TOKEN_BUDGET)
  if (hardMaxTokens < tokenBudget) {
    throw new TypeError(
      `lossless-anchors: hardMaxTokens (${hardMaxTokens}) must be >= tokenBudget (${tokenBudget})`,
    )
  }
  const maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS
  const maxAnchors = input.maxAnchors ?? DEFAULT_MAX_ANCHORS
  requireSafeInteger('maxTurns', maxTurns, 1)
  requireSafeInteger('maxAnchors', maxAnchors, 1)
  const includeSources = new Set(input.includeSources ?? DEFAULT_INCLUDE_SOURCES)
  return {
    tokenBudget,
    hardMaxTokens,
    maxTurns,
    maxAnchors,
    includeSources,
    required: input.required ?? true,
  }
}

/** Reject values that cannot be an exact non-negative integer above a floor. */
function requireSafeInteger(name: string, value: number, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new TypeError(`lossless-anchors: ${name} must be a safe integer >= ${min}, got ${String(value)}`)
  }
}
