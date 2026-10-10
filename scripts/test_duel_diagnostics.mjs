import assert from "node:assert/strict";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["src/variant/duelDiagnostics.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const diagnostics = await import(
  `data:text/javascript;base64,${Buffer.from(
    built.outputFiles[0].text,
  ).toString("base64")}`
);
const {
  markActionSent,
  markMessageArrival,
  markMessageProcessing,
  markFrameProcessing,
  markNextPrompt,
  getDuelDiagnostics,
} = diagnostics;
const owner = {
  pendingMessages: 3,
  pendingPackets: 2,
  password: "must never appear",
  nickname: "private",
  deck: [123],
};
const event = { privatePayload: "never record" };
markActionSent(owner, 100);
markMessageArrival(owner, event, 250);
markMessageProcessing(event, 800);
markMessageProcessing(event, 900);
markFrameProcessing(owner, event, 800);
markFrameProcessing(owner, event, 1000);
markNextPrompt(owner, 1200);
markNextPrompt(owner, 2000);
assert.deepEqual(getDuelDiagnostics(owner), {
  version: 1,
  queuedNow: 5,
  samples: [
    {
      queuedAtSend: 5,
      timeToFirstMessageMs: 150,
      firstMessageQueueMs: 550,
      maxFrameQueueMs: 750,
      timeToNextPromptMs: 1100,
    },
  ],
});
const earlierEvent = {};
markMessageArrival(owner, earlierEvent, 2200);
markActionSent(owner, 2300);
markMessageProcessing(earlierEvent, 2700);
markFrameProcessing(owner, earlierEvent, 2700);
assert.deepEqual(
  getDuelDiagnostics(owner).samples[1],
  { queuedAtSend: 5 },
  "An older queued message must not become the new action's reply",
);
for (let i = 0; i < 40; i++) markActionSent(owner, 3000 + i);
assert.equal(getDuelDiagnostics(owner).samples.length, 30);
assert.deepEqual(
  getDuelDiagnostics({}).samples,
  [],
  "Reconnection starts an independent diagnostic session",
);
const output = JSON.stringify(getDuelDiagnostics(owner));
for (const secret of ["must never appear", "private", "123", "sentAt"])
  assert.ok(!output.includes(secret));
console.log(
  "Passive timing: queue/network separation, duplicate marks, old events, 30-sample bound and privacy passed.",
);
