import { proxy } from "valtio";

/** Set when a sound was skipped because the browser keeps the audio context
 * suspended until the next tap (autoplay policy), e.g. an auto-started replay
 * or a spectator link opened without a click. Cleared once audio runs. */
export const audioBlocked = proxy({ replay: false, online: false });

/** Window gestures that may resume a suspended context (iOS needs touchend). */
export const UNLOCK_GESTURES = ["pointerdown", "touchend", "click", "keydown"];
