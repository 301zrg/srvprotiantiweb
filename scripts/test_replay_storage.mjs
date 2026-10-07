import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const lib = await server.ssrLoadModule("/src/replay/library.ts"),
    { ReplayCapture, replayCaptureStatus } = await server.ssrLoadModule(
      "/src/replay/capture.ts",
    );
  const bytes = new Uint8Array(
      readFileSync("tests/fixtures/replay/native-deckout.yrp"),
    ),
    other = new Uint8Array(
      readFileSync("tests/fixtures/replay/native-battle-equip.yrp"),
    );
  const meta = (session, order = 1) => ({
    session,
    order,
    room: "TestRoom",
    nickname: "Fixture",
    receivedAt: Date.now(),
    profile: "706-v1-candidate",
  });
  const [a, b] = await Promise.all([
    lib.saveReplay(bytes, "a.yrp", meta("match-a")),
    lib.saveReplay(bytes, "b.yrp", meta("match-b")),
  ]);
  assert.equal(a.id, b.id);
  assert.equal((await lib.listReplays()).length, 1);
  await lib.saveReplay(bytes, "duplicate.yrp", meta("match-a", 2));
  const db = await new Promise((r, j) => {
    const q = indexedDB.open("srvpro-replays");
    q.onsuccess = () => r(q.result);
    q.onerror = j;
  });
  const count = (name) =>
    new Promise((r, j) => {
      const q = db.transaction(name).objectStore(name).count();
      q.onsuccess = () => r(q.result);
      q.onerror = j;
    });
  assert.equal(await count("blobs"), 1);
  assert.equal(
    await count("occurrences"),
    2,
    "Duplicate packet in one match must not add a fake game",
  );
  await lib.renameReplay(a.id, "new title");
  assert.equal((await lib.getReplay(a.id)).entry.title, "new title");
  assert.deepEqual(
    new Uint8Array(await (await lib.getReplay(a.id)).blob.arrayBuffer()),
    bytes,
  );
  const packet = (proto, body = new Uint8Array()) => {
    const out = new Uint8Array(body.length + 3);
    new DataView(out.buffer).setUint16(0, body.length + 1, true);
    out[2] = proto;
    out.set(body, 3);
    return out;
  };
  const cap = new ReplayCapture({
    room: "FixtureRoom$privateRoomPassword",
    nickname: "Fixture$privateAccountPassword",
  });
  const host = new Uint8Array(20);
  new DataView(host.buffer).setUint32(0, 0x73ec4051, true);
  host[6] = 2;
  cap.receive(packet(0x12, host).buffer);
  cap.receive(packet(0x15).buffer);
  const parts = [packet(0x17, bytes), packet(0x17, other), packet(0x17, bytes)];
  const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let p = 0;
  for (const part of parts) {
    total.set(part, p);
    p += part.length;
  }
  cap.receive(total.slice(0, 4).buffer);
  cap.receive(total.slice(4).buffer);
  await cap.finish();
  assert.equal(replayCaptureStatus.saved, 2);
  assert.equal((await lib.listReplays()).length, 2);
  const occurrences = await new Promise((r, j) => {
    const q = db.transaction("occurrences").objectStore("occurrences").getAll();
    q.onsuccess = () => r(q.result);
    q.onerror = j;
  });
  assert.ok(!JSON.stringify(occurrences).includes("privateAccountPassword"));
  assert.ok(!JSON.stringify(occurrences).includes("privateRoomPassword"));
  assert.ok(
    occurrences
      .filter((o) => o.room === "FixtureRoom")
      .every((o) => o.host?.lflist === 0x73ec4051 && o.host?.duelRule === 2),
    "Capture should freeze actual non-sensitive HostInfo",
  );
  await lib.deleteReplay(a.id);
  assert.equal(await count("blobs"), 1);
  assert.equal((await lib.listReplays()).length, 1);
  await assert.rejects(() => lib.getReplay(a.id));
  await lib.deleteReplay((await lib.listReplays())[0].id);
  assert.equal(await count("blobs"), 0);
  assert.equal(await count("occurrences"), 0);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "entries")
      throw new DOMException("Quota fixture", "QuotaExceededError");
    return put.apply(this, args);
  };
  const temporary = await lib.saveReplay(bytes, "temporary.yrp");
  IDBObjectStore.prototype.put = put;
  assert.equal(temporary.temporary, true);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(
    await count("blobs"),
    0,
    "Failed entry write must not commit an orphan Blob",
  );
  assert.deepEqual(
    new Uint8Array(
      await (await lib.getReplay(temporary.id)).blob.arrayBuffer(),
    ),
    bytes,
  );
  await lib.deleteReplay(temporary.id);
  assert.equal((await lib.listReplays()).length, 0);
  const invalid = bytes.slice();
  new DataView(invalid.buffer).setUint32(16, 0xffffffff, true);
  await assert.rejects(() => lib.saveReplay(invalid, "bad.yrp"));
  const legacy = new Uint8Array([40, 1, 0, 0, 0, 0]);
  const legacyEntry = await lib.saveReplay(legacy, "legacy.yrp3d");
  assert.equal(legacyEntry.header.format, "YRP3D");
  assert.equal(legacyEntry.header.playable, false);
  assert.equal(legacyEntry.filename, "legacy.yrp3d");
  assert.deepEqual(
    new Uint8Array(
      await (await lib.getReplay(legacyEntry.id)).blob.arrayBuffer(),
    ),
    legacy,
  );
  await lib.deleteReplay(legacyEntry.id);
  await assert.rejects(() =>
    lib.saveReplay(legacy.slice(0, -1), "truncated.yrp3d"),
  );
  await assert.rejects(() => lib.saveReplay(legacy, "disguised.yrp"));
  const oldCap = new ReplayCapture();
  oldCap.receive(packet(0x15).buffer);
  oldCap.receive(packet(0x17, bytes).buffer);
  const newCap = new ReplayCapture();
  newCap.receive(packet(0x15).buffer);
  await oldCap.finish();
  assert.equal(
    replayCaptureStatus.state,
    "receiving",
    "Old queued save must not change the new session receipt",
  );
  assert.equal(replayCaptureStatus.saved, 0);
  assert.equal((await lib.listReplays()).length, 1);
  newCap.stop();
  await lib.deleteReplay((await lib.listReplays())[0].id);
  const missing = new ReplayCapture();
  missing.receive(packet(0x15).buffer);
  missing.stop();
  assert.equal(replayCaptureStatus.state, "missing");
  db.close();
  console.log(
    "Replay transactions, concurrent dedup, match associations, split capture, raw bytes, credential stripping, quota rollback and memory fallback passed",
  );
} finally {
  await server.close();
}
