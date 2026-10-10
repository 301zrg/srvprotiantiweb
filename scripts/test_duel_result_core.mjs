// Actual fixed Core and Lua, synthetic fields only; never contacts SRVPro.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true }, logLevel: "error",
});
try {
  const { ReplayEngine } = await vite.ssrLoadModule("/src/replay/engine.ts");
  const { splitCoreMessages } = await vite.ssrLoadModule("/src/replay/messages.ts");
  const create = (await import(pathToFileURL(resolve("public/replay/706-v1/ocgcore.js")))).default;
  const core = await create({ wasmBinary: readFileSync("public/replay/706-v1/ocgcore.wasm"), printErr() {} });
  const engine = new ReplayEngine(core);
  engine.install(readFileSync("public/replay/706-v1/cards.data"), gunzipSync(readFileSync("public/replay/706-v1/scripts.data")));
  const alloc = bytes => { const ptr = core._malloc(bytes.length); core.HEAPU8.set(bytes, ptr); return ptr; };
  const response = (handle, value) => {
    const bytes = new Uint8Array(256);
    if (typeof value === "number") new DataView(bytes.buffer).setInt32(0, value, true);
    else bytes.set(value);
    const ptr = alloc(bytes);
    core._set_responseb(handle, ptr); core._free(ptr);
  };
  for (const choice of [0, 1, 2]) {
    const seed = alloc(new Uint8Array(new Uint32Array([11, 22, 33, 44, 55, 66, 77, 88]).buffer));
    const handle = core._replay_create(seed, 11, 0);
    core._free(seed);
    assert.ok(handle && core._replay_has_special(handle));
    try {
      for (const player of [0, 1]) {
        core._set_player_info(handle, player, 8000, 5, 1);
        for (let i = 0; i < 40; i++) core._new_card(handle, 89631139, player, player, 1, 0, 8);
      }
      const source = alloc(Buffer.from(`
        assert(Debug.AddCard(54719828,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK,true))
        assert(Debug.AddCard(89631139,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK))
      \0`));
      assert.equal(core._replay_evaluate(handle, source), 1, core.UTF8ToString(core._replay_error()));
      core._free(source);
      core._start_duel(handle, 0);
      const trace = [];
      let activated = false, chose = false, complete = false;
      for (let step = 0; step < 200 && !complete; step++) {
        const size = core._process(handle) & 0xfffffff;
        assert.ok(size, "Core should produce a bounded message or choice");
        const ptr = core._malloc(size);
        core._get_message(handle, ptr);
        const events = splitCoreMessages(core.HEAPU8.slice(ptr, ptr + size));
        core._free(ptr);
        for (const bytes of events) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          trace.push([...bytes]);
          assert.notEqual(bytes[0], 1, "A test response must not cause MSG_RETRY");
          if (bytes[0] === 11) {
            let at = 2;
            for (let i = 0; i < 5; i++) { const count = bytes[at++]; at += count * 7; }
            const count = bytes[at++];
            let action;
            for (let i = 0; i < count; i++, at += 11)
              if (view.getUint32(at, true) === 54719828) action = (i << 16) | 5;
            assert.ok(action !== undefined && !activated, "Shock Master must be available to activate with an overlay");
            response(handle, action); activated = true;
          } else if (bytes[0] === 14) {
            assert.deepEqual(Array.from({ length: bytes[2] }, (_, i) => view.getUint32(3 + i * 4, true)), [70, 71, 72]);
            assert.ok(trace.some(message => message[0] === 50 && (message[6] & 0x80)),
              "An overlay must already be removed as cost before declaring the card type");
            response(handle, choice); chose = true;
          } else if ([15, 26].includes(bytes[0])) response(handle, [1, 0]);
          else if (bytes[0] === 16) response(handle, -1);
          else if ([12, 13].includes(bytes[0])) response(handle, 1);
          if (bytes[0] === 165 && bytes[1] === 1 && bytes[2] === 6) complete = true;
        }
      }
      assert.ok(activated && chose && complete);
      const selection = trace.find(bytes => bytes[0] === 2 && bytes[1] === 4);
      assert.equal(Buffer.from(selection).readUInt32LE(3), 70 + choice);
      const restrictions = trace.filter(bytes => bytes[0] === 165 && bytes[2] === 6);
      assert.deepEqual(restrictions.map(bytes => bytes[1]), [0, 1]);
      assert.ok(restrictions.every(bytes => Buffer.from(bytes).readUInt32LE(3) === 54719828 * 16 + 2 + choice));
      console.log(`PASS actual 706 Core: Shock Master choice ${70 + choice}, public option and both player restrictions`);
    } finally { core._end_duel(handle); }
  }
} finally { await vite.close(); }
