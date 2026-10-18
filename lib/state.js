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
import { z as zod } from 'zod';
import { messageText } from './render.js';
import { isValidTimeZone } from './time.js';
const anchorSchema = zod.object({
    seq: zod.number().int().nonnegative(),
    turn: zod.number().int().nonnegative(),
    time: zod.number(),
    zone: zod.string().optional(),
    source: zod.string(),
    text: zod.string(),
});
const stateSchema = zod.object({
    turn: zod.number().int().nonnegative(),
    anchors: zod.array(anchorSchema),
});
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
export function registerAnchorProjection(ctx, config) {
    ctx.sessionProjections.register({
        key: 'losslessAnchors',
        stateVersion: 2,
        stateSchema,
        init: () => ({ turn: 0, anchors: [] }),
        apply: (state, event) => {
            if (event.type === 'turn/start') {
                return state.turn === event.data.turn ? state : { ...state, turn: event.data.turn };
            }
            if (event.type !== 'user/message')
                return state;
            if (!config.includeSources.has(event.data.source.kind))
                return state;
            const text = messageText(event.data);
            if (text.trim().length === 0)
                return state;
            const zone = browserTimeZone(event.data.source);
            const anchor = {
                seq: event.seq,
                turn: state.turn,
                time: event.time,
                ...(zone === undefined ? {} : { zone }),
                source: event.data.source.kind,
                text,
            };
            const kept = config.maxAnchors === 1
                ? []
                : state.anchors.slice(-(config.maxAnchors - 1));
            return { ...state, anchors: [...kept, anchor] };
        },
    });
}
/**
 * Read the browser zone a transported prompt recorded on its source.
 *
 * Web prompts carry `clientTimeZone` on their `user-rpc` source; older or
 * non-browser producers carry none. A label the runtime cannot format is
 * ignored at capture so rendering never has to discover it.
 *
 * @param source - the message source recorded on the durable event.
 * @returns a usable IANA zone, or `undefined`.
 */
function browserTimeZone(source) {
    const value = source.clientTimeZone;
    return typeof value === 'string' && isValidTimeZone(value) ? value : undefined;
}
