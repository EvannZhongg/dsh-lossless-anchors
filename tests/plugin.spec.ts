import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionSeq } from '@deepseek-ai/dsh-session'
import { assembleContextFor, type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import {
  mountAgentLoopTestDependencies,
  unsupportedInbox,
} from '@deepseek-ai/dsh-agent-loop-testkit'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt, { renderContextSnapshot, renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import * as plugin from '../src/index.ts'
import type { Config } from '../src/config.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'test-compaction': { kind: 'test-compaction' }
    'test-non-anchor': { kind: 'test-non-anchor' }
  }
}

function fakeAgent(session: Session): Agent {
  return {
    id: session.id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'running',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

async function mountProvider(
  config: Config = {},
  systemPromptConfig: { includeRuntimeContext?: boolean } = {},
): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, systemPromptConfig)
  await ctx.plugin(plugin, config)
  return ctx
}

function appendUser(session: Session, text: string, source = 'user'): SessionSeq {
  session.append('turn/start', { turn: 1 })
  const event = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: source } as never,
  }), { surfaceOp: 'append' })
  return event.seq
}

function shadow(session: Session, seq: SessionSeq, summary = 'lossy summary'): void {
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: summary }],
    source: { kind: 'test-compaction' },
  }), {
    surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq },
    sourceEventSeqs: [seq],
  })
}

async function snapshot(ctx: Context, session: Session): Promise<string> {
  const assembly = await ctx.systemPrompt.assemble(assembleContextFor(fakeAgent(session)))
  return renderContextSnapshot(assembly)
}

async function promptText(ctx: Context, session: Session): Promise<string> {
  const assembly = await ctx.systemPrompt.assemble(assembleContextFor(fakeAgent(session)))
  return renderPrompt(assembly)
}

describe('PromptContext integration', () => {
  it('shows no anchors while the user message is still on the surface', async () => {
    const ctx = await mountProvider()
    try {
      const session = Session.create(SessionId('visible'))
      appendUser(session, 'visible instruction')
      expect(await snapshot(ctx, session)).toBe('')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('adds the policy section only when an anchor block exists', async () => {
    const ctx = await mountProvider()
    try {
      const session = Session.create(SessionId('policy-on-demand'))
      const seq = appendUser(session, 'policy anchor')
      expect(await promptText(ctx, session)).not.toContain('When the runtime context contains a [Lossless User Anchors] block')

      shadow(session, seq)
      expect(await promptText(ctx, session)).toContain('When the runtime context contains a [Lossless User Anchors] block')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('re-materializes the exact user text after a surface replacement shadows it', async () => {
    const ctx = await mountProvider()
    try {
      const session = Session.create(SessionId('shadowed'))
      const seq = appendUser(session, 'KEEP THIS EXACTLY: {{literal}}')
      shadow(session, seq)

      const text = await snapshot(ctx, session)
      expect(text).toContain('[Lossless User Anchors]')
      expect(text).toContain('KEEP THIS EXACTLY: {{literal}}')
      expect(text).toContain('This block supersedes earlier [Lossless User Anchors] blocks.')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('renders the browser zone recorded on the message source', async () => {
    const ctx = await mountProvider()
    try {
      const session = Session.create(SessionId('source-zone'))
      session.append('turn/start', { turn: 1 })
      const event = session.append('user/message', createUserMessage({
        content: [{ type: 'text', text: 'zoned anchor' }],
        source: { kind: 'user', rpcId: 'req-1', clientTimeZone: 'America/New_York' } as never,
      }), { surfaceOp: 'append' })
      shadow(session, event.seq)

      const text = await snapshot(ctx, session)
      expect(text).toContain('[America/New_York]')
      expect(text).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[45]:00\[America\/New_York\]/)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('falls back to the configured zone when the source recorded none', async () => {
    const ctx = await mountProvider({ timeZone: 'UTC' })
    try {
      const session = Session.create(SessionId('fallback-zone'))
      const seq = appendUser(session, 'unzoned anchor')
      shadow(session, seq)

      const text = await snapshot(ctx, session)
      expect(text).toContain('+00:00[UTC]')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps anchors when optional runtime context is suppressed', async () => {
    const ctx = await mountProvider({ required: true }, { includeRuntimeContext: false })
    try {
      const session = Session.create(SessionId('required'))
      const seq = appendUser(session, 'required anchor')
      shadow(session, seq)
      expect(await snapshot(ctx, session)).toContain('required anchor')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('drops anchors when they are optional and runtime context is suppressed', async () => {
    const ctx = await mountProvider({ required: false }, { includeRuntimeContext: false })
    try {
      const session = Session.create(SessionId('optional'))
      const seq = appendUser(session, 'optional anchor')
      shadow(session, seq)
      expect(await snapshot(ctx, session)).toBe('')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('does not anchor non-user message sources', async () => {
    const ctx = await mountProvider()
    try {
      const session = Session.create(SessionId('source-filter'))
      const seq = appendUser(session, 'automatic notice', 'test-non-anchor')
      shadow(session, seq)
      expect(await snapshot(ctx, session)).toBe('')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: StreamChunk[][]) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.script.shift()
    if (chunks === undefined) throw new Error('ScriptedAdapter: script exhausted')
    for (const chunk of chunks) yield chunk
  }
}

function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

function requestText(request: GenerateOptions): string {
  return request.messages
    .flatMap(message => message.content)
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

async function mountLoop(adapter: ScriptedAdapter): Promise<{ ctx: Context; agent: Agent }> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  await ctx.plugin(plugin, { tokenBudget: 2000, hardMaxTokens: 3000 })
  const agent = await ctx.agentLoop.create(SessionId('lossless-anchors-loop'), {
    provider: 'mock',
    model: 'mock',
  })
  return { ctx, agent }
}

describe('AgentLoop compaction restore', () => {
  it('keeps a shadowed user instruction verbatim in the next request', async () => {
    const adapter = new ScriptedAdapter([
      textResponse('first response'),
      textResponse('second response'),
    ])
    const { ctx, agent } = await mountLoop(adapter)
    try {
      const exact = 'KEEP THIS EXACT INSTRUCTION: path C:\\work\\a.txt, value 42'
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: exact }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()
      expect(requestText(adapter.requests[0]!)).toContain(exact)
      expect(adapter.requests[0]?.messages.some(message => (message.source?.kind as string | undefined) === 'runtime-context')).toBe(false)

      const userEvent = agent.session.snapshotEvents().find(event =>
        event.type === 'user/message' && event.data.source.kind === 'user')
      if (userEvent === undefined) throw new Error('missing user event')
      shadow(agent.session, userEvent.seq)

      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'continue after compaction' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const second = requestText(adapter.requests[1]!)
      expect(second).toContain('[Lossless User Anchors]')
      expect(second).toContain(exact)
      const anchorMessage = adapter.requests[1]?.messages.find(message =>
        message.role === 'user' && (message.source?.kind as string | undefined) === 'runtime-context')
      expect(anchorMessage?.source?.kind).toBe('runtime-context')
      expect(anchorMessage?.content.some(block => block.type === 'text' && block.text.includes(exact))).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('recreates the anchor snapshot after the snapshot itself is shadowed', async () => {
    const adapter = new ScriptedAdapter([
      textResponse('one'),
      textResponse('two'),
      textResponse('three'),
    ])
    const { ctx, agent } = await mountLoop(adapter)
    try {
      const exact = 'restore this anchor after every compaction'
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: exact }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const userEvent = agent.session.snapshotEvents().find(event =>
        event.type === 'user/message' && event.data.source.kind === 'user')
      if (userEvent === undefined) throw new Error('missing user event')
      shadow(agent.session, userEvent.seq)

      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'second request' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const contextEvent = agent.session.snapshotEvents().find(event =>
        event.type === 'user/message'
        && (event.data.source.kind as string) === 'runtime-context'
        && event.data.content.some(block => block.type === 'text' && block.text.includes('[Lossless User Anchors]')))
      if (contextEvent === undefined) throw new Error('missing anchor context')
      shadow(agent.session, contextEvent.seq, 'snapshot replaced')

      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'third request' }],
        source: { kind: 'user' },
      }))
      await agent.whenIdle()

      const third = requestText(adapter.requests[2]!)
      expect(third).toContain('[Lossless User Anchors]')
      expect(third).toContain(exact)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
