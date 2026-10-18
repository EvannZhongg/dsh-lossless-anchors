/**
 * Durable Session projection that captures user-authored messages and the turn
 * that produced them.
 *
 * Shadowing is deliberately NOT folded here. The renderer compares each
 * anchor's seq with the live `Session.surface.nodes`; that is the
 * backend-independent definition of "shadowed" and survives replay, resume,
 * and forks without trusting a particular replacement producer.
 *
 * @module dsh-lossless-anchors/state
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedConfig } from './config.js';
import type { AnchorState } from './types.js';
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        /** Captured user anchors for this Session. */
        losslessAnchors: AnchorState;
    }
}
/**
 * Register the `losslessAnchors` projection.
 *
 * The unit only records; it never removes an anchor when the surface changes,
 * because the original log event remains the authority and the renderer reads
 * current surface membership.
 *
 * @param ctx - plugin context with `sessionProjections`.
 * @param config - resolved plugin configuration.
 */
export declare function registerAnchorProjection(ctx: Context, config: ResolvedConfig): void;
