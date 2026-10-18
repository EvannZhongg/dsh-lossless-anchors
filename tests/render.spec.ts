import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import {
  ANCHOR_HEADER,
  ANCHOR_TRUNCATION_MARKER,
  estimateTextTokens,
  formatAnchors,
  selectAnchors,
} from '../src/render.ts'
import type { Anchor, AnchorState } from '../src/types.ts'

const TIME = Date.parse('2026-10-19T00:00:00.000Z')

function anchor(seq: number, turn: number, text: string, source = 'user'): Anchor {
  return { seq, turn, time: TIME + seq, source, text }
}

function state(anchors: Anchor[]): AnchorState {
  return { turn: anchors.at(-1)?.turn ?? 0, anchors }
}

describe('anchor selection', () => {
  it('uses only messages whose original surface node is shadowed', () => {
    const result = selectAnchors(
      state([
        anchor(1, 1, 'still visible'),
        anchor(2, 1, 'already shadowed'),
      ]),
      [1],
      resolveConfig({ tokenBudget: 2000, hardMaxTokens: 3000 }),
    )

    expect(result.text).toContain('already shadowed')
    expect(result.text).not.toContain('still visible')
    expect(result.anchors.map(item => item.seq)).toEqual([2])
  })

  it('preserves exact user text, including whitespace and template braces', () => {
    const exact = '  keep {{this}} exactly\nsecond line with trailing spaces  '
    const result = selectAnchors(
      state([anchor(1, 1, exact)]),
      [],
      resolveConfig({ tokenBudget: 2000, hardMaxTokens: 3000 }),
    )

    expect(result.text).toContain(exact)
    expect(result.text).toContain(ANCHOR_HEADER)
  })

  it('includes the newest turn and stops before an older turn that would exceed the soft budget', () => {
    const result = selectAnchors(
      state([
        anchor(1, 1, 'a'.repeat(300)),
        anchor(2, 2, 'b'.repeat(300)),
        anchor(3, 3, 'c'.repeat(300)),
      ]),
      [],
      resolveConfig({ tokenBudget: 250, hardMaxTokens: 375 }),
    )

    expect(result.text).toContain('c'.repeat(300))
    expect(result.text).not.toContain('b'.repeat(300))
    expect(result.text).not.toContain('a'.repeat(300))
    expect(result.estimatedTokens).toBeLessThanOrEqual(250)
  })

  it('truncates an oversized single turn at the hard cap with an explicit marker', () => {
    const result = selectAnchors(
      state([anchor(1, 1, 'x'.repeat(5000))]),
      [],
      resolveConfig({ tokenBudget: 200, hardMaxTokens: 300 }),
    )

    expect(result.meta.truncated).toBe(true)
    expect(result.meta.truncatedAnchors).toBe(1)
    expect(result.text).toContain(ANCHOR_TRUNCATION_MARKER)
    expect(result.estimatedTokens).toBeLessThanOrEqual(300)
    expect(result.text).toContain('x'.repeat(20))
  })

  it('drops the oldest anchors of an oversized turn before truncating text', () => {
    const first = `FIRST-${'a'.repeat(400)}`
    const second = `SECOND-${'b'.repeat(400)}`
    const third = `THIRD-${'c'.repeat(400)}`
    const result = selectAnchors(
      state([
        anchor(1, 1, first),
        anchor(2, 1, second),
        anchor(3, 1, third),
      ]),
      [],
      resolveConfig({ tokenBudget: 400, hardMaxTokens: 400 }),
    )

    expect(result.meta.truncated).toBe(true)
    expect(result.meta.elidedAnchors).toBeGreaterThan(0)
    expect(result.text).not.toContain('FIRST-')
    expect(result.text).toContain('THIRD-')
    expect(result.estimatedTokens).toBeLessThanOrEqual(400)
  })

  it('fits an older oversized turn into the remaining soft budget and marks the cut', () => {
    const result = selectAnchors(
      state([
        anchor(1, 1, `OLD-${'o'.repeat(2000)}`),
        anchor(2, 2, 'NEWEST'),
      ]),
      [],
      resolveConfig({ tokenBudget: 400, hardMaxTokens: 600 }),
    )

    expect(result.text).toContain('NEWEST')
    expect(result.text).toContain('OLD-')
    expect(result.text).toContain(ANCHOR_TRUNCATION_MARKER)
    expect(result.estimatedTokens).toBeLessThanOrEqual(400)
    expect(result.meta.truncated).toBe(true)
  })

  it('limits the number of turns considered', () => {
    const result = selectAnchors(
      state([
        anchor(1, 1, 'turn-one'),
        anchor(2, 2, 'turn-two'),
        anchor(3, 3, 'turn-three'),
        anchor(4, 4, 'turn-four'),
      ]),
      [],
      resolveConfig({ tokenBudget: 2000, hardMaxTokens: 3000, maxTurns: 2 }),
    )

    expect(result.text).toContain('turn-three')
    expect(result.text).toContain('turn-four')
    expect(result.text).not.toContain('turn-one')
    expect(result.text).not.toContain('turn-two')
  })

  it('returns an empty block without anchors', () => {
    const result = selectAnchors(state([]), [], resolveConfig({ tokenBudget: 2000 }))
    expect(result.text).toBe('')
    expect(result.estimatedTokens).toBe(0)
  })
})

describe('anchor formatting', () => {
  it('keeps the disclosure header and truncation accounting visible', () => {
    const rendered = formatAnchors(
      [anchor(1, 3, 'body', 'user-question-reply')],
      { truncated: true, elidedAnchors: 2, truncatedAnchors: 1 },
    )

    expect(rendered).toContain('--- turn 3 | 2026-10-19T00:00:00.001Z | user-question-reply ---')
    expect(rendered).toContain('2 older anchor message(s) elided')
    expect(rendered).toContain('1 anchor text(s) truncated')
  })

  it('prices rendered text with the same heuristic as a user message', () => {
    expect(estimateTextTokens('hello')).toBeGreaterThan(0)
    expect(estimateTextTokens('')).toBe(8)
  })
})
