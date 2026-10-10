/** Passive timing only: no packets, player data, URLs or automatic uploads. */
interface Owner {
  pendingMessages?: number;
  pendingPackets?: number;
}
interface Sample {
  queuedAtSend: number;
  timeToFirstMessageMs?: number;
  firstMessageQueueMs?: number;
  maxFrameQueueMs?: number;
  timeToNextPromptMs?: number;
}
type InternalSample = Sample & { sentAt: number };
const sessions = new WeakMap<object, InternalSample[]>();
const arrivals = new WeakMap<object, { at: number; sample?: InternalSample }>();
const rounded = (value: number) => Math.max(0, Math.round(value));

export function markActionSent(owner: Owner, now = performance.now()) {
  const samples = sessions.get(owner) ?? [];
  samples.push({
    sentAt: now,
    queuedAtSend: (owner.pendingMessages ?? 0) + (owner.pendingPackets ?? 0),
  });
  if (samples.length > 30) samples.shift();
  sessions.set(owner, samples);
}

export function markMessageArrival(
  owner: Owner,
  event: object,
  now = performance.now(),
) {
  const latest = sessions.get(owner)?.at(-1);
  const sample =
    latest?.timeToFirstMessageMs === undefined ? latest : undefined;
  if (sample) sample.timeToFirstMessageMs = rounded(now - sample.sentAt);
  arrivals.set(event, { at: now, sample });
}

export function markMessageProcessing(event: object, now = performance.now()) {
  const arrival = arrivals.get(event);
  if (arrival?.sample && arrival.sample.firstMessageQueueMs === undefined)
    arrival.sample.firstMessageQueueMs = rounded(now - arrival.at);
}

export function markNextPrompt(owner: Owner, now = performance.now()) {
  const sample = sessions.get(owner)?.at(-1);
  if (sample && sample.timeToNextPromptMs === undefined)
    sample.timeToNextPromptMs = rounded(now - sample.sentAt);
}

/** Includes preceding animations within a coalesced WebSocket message. */
export function markFrameProcessing(
  owner: Owner,
  event: object,
  now = performance.now(),
) {
  const arrival = arrivals.get(event);
  const sample = sessions.get(owner)?.at(-1);
  if (
    !arrival ||
    !sample ||
    arrival.at < sample.sentAt ||
    sample.timeToNextPromptMs !== undefined
  )
    return;
  sample.maxFrameQueueMs = Math.max(
    sample.maxFrameQueueMs ?? 0,
    rounded(now - arrival.at),
  );
}

export function getDuelDiagnostics(owner?: Owner) {
  return {
    version: 1,
    queuedNow: owner
      ? (owner.pendingMessages ?? 0) + (owner.pendingPackets ?? 0)
      : 0,
    samples: (owner ? sessions.get(owner) ?? [] : []).map(
      ({ sentAt: _sentAt, ...sample }) => sample,
    ),
  };
}
