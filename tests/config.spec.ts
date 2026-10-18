import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INCLUDE_SOURCES,
  DEFAULT_TOKEN_BUDGET,
  resolveConfig,
} from '../src/config.ts'
import { systemTimeZone } from '../src/time.ts'

describe('configuration', () => {
  it('applies the 2000-token default and a 1.5x hard cap', () => {
    const resolved = resolveConfig({})
    expect(resolved.tokenBudget).toBe(DEFAULT_TOKEN_BUDGET)
    expect(resolved.hardMaxTokens).toBe(3000)
    expect(resolved.maxTurns).toBe(32)
    expect(resolved.maxAnchors).toBe(256)
    expect([...resolved.includeSources]).toEqual([...DEFAULT_INCLUDE_SOURCES])
    expect(resolved.timeZone).toBe(systemTimeZone())
    expect(resolved.required).toBe(true)
  })

  it('derives the hard cap from a custom budget', () => {
    expect(resolveConfig({ tokenBudget: 1000 }).hardMaxTokens).toBe(1500)
    expect(resolveConfig({ tokenBudget: 1000, hardMaxTokens: 1200 }).hardMaxTokens).toBe(1200)
  })

  it('rejects a hard cap below the soft budget', () => {
    expect(() => resolveConfig({ tokenBudget: 2000, hardMaxTokens: 1500 }))
      .toThrow(/hardMaxTokens .* must be >= tokenBudget/)
  })

  it('rejects invalid integer budgets', () => {
    expect(() => resolveConfig({ tokenBudget: 199 })).toThrow(/tokenBudget/)
    expect(() => resolveConfig({ tokenBudget: 200.5 })).toThrow(/tokenBudget/)
    expect(() => resolveConfig({ maxTurns: 0 })).toThrow(/maxTurns/)
    expect(() => resolveConfig({ maxAnchors: 0 })).toThrow(/maxAnchors/)
  })

  it('accepts an explicit display zone and rejects an unknown one', () => {
    expect(resolveConfig({ timeZone: 'UTC' }).timeZone).toBe('UTC')
    expect(resolveConfig({ timeZone: 'America/New_York' }).timeZone).toBe('America/New_York')
    expect(() => resolveConfig({ timeZone: 'Not/AZone' })).toThrow(/timeZone/)
  })
})
