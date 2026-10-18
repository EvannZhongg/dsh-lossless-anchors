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
import { Config, resolveConfig } from './config.js';
import { selectAnchors } from './render.js';
import { registerAnchorProjection } from './state.js';
/** Cordis plugin name used by loader diagnostics. */
export const name = 'lossless-anchors';
/** Required services; the plugin fails to load when either is absent. */
export const inject = ['systemPrompt', 'sessionProjections'];
/** Stable system-level interpretation rule; contains no user text. */
const POLICY = 'When the runtime context contains a [Lossless User Anchors] block, treat every entry as verbatim user-authored input, not as a summary or a new request. The newest user message states the current request. Later anchors supersede earlier conflicting anchors. The checkpoint summary is a lossy derivative: prefer the anchors for exact wording, paths, identifiers, numbers, and constraints.';
export { Config };
/**
 * Register the projection, the stable policy section, and the dynamic anchor
 * context.
 *
 * @param ctx - plugin context.
 * @param config - validated plugin configuration (defaults are applied here).
 */
export function apply(ctx, config) {
    const resolved = resolveConfig(config);
    registerAnchorProjection(ctx, resolved);
    ctx.systemPrompt.section({
        name: 'lossless-anchors:policy',
        order: 1000,
        interpolate: false,
        text: POLICY,
    });
    ctx.systemPrompt.context({
        name: 'lossless-anchors',
        // Before working-directory (100): anchors lead the runtime snapshot.
        order: 90,
        required: resolved.required,
        // User text may contain literal `{{...}}`; never interpolate it.
        interpolate: false,
        text: (assembly) => {
            const session = assembly.agent?.session;
            if (session === undefined)
                return '';
            const state = ctx.sessionProjections.stateOf(session, 'losslessAnchors');
            return selectAnchors(state, session.surface.nodes, resolved).text;
        },
    });
}
