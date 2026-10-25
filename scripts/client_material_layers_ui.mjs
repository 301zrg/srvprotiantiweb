import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const folder = ".audit-tmp/client-material-layers-ui",
  outDir = folder + "/web";
mkdirSync(folder, { recursive: true });
const base = readFileSync("scripts/client_followup_ui.mjs", "utf8").match(
  /const fixture=`([\s\S]*?)`;\r?\nlet browser/,
)[1];
const prior = readFileSync("scripts/client_round4_ui.mjs", "utf8").match(
  /const fixture=base\+`([\s\S]*?)`;\r?\nlet browser/,
)[1];
const fixture =
  base +
  prior +
  `
import moveMaterialTest from '@/service/duel/move';
window.__materialLayers={
 online(count,player,defense,order){
  window.__followup.duel();const Z=api.ygopro.CardZone;
  const host=window.__round4.card(10002346,Z.MZONE,2,player);host.location.position=defense?2:0;
  const materials=Array.from({length:count},(_,i)=>window.__round4.card(i%2?46986414:26202165,Z.MZONE,2,player,true,i));
  this.hostId=host.uuid;this.materialIds=materials.map(c=>c.uuid);
  stores.cardStore.inner=order.map(i=>i===count?host:materials[i]);
 },
 async step(name){
  const Z=api.ygopro.CardZone;const host=stores.cardStore.inner.find(c=>c.uuid===this.hostId);const material=stores.cardStore.inner.find(c=>c.uuid===this.materialIds[1]);
  if(name==='focus'){await eventbus.call(Task.Focus,host.uuid);return;}
  const target=['detach','reattach'].includes(name)?material:host;
  const to=new api.ygopro.CardLocation({...target.location.toObject(),...(name==='position'?{position:2}:name==='detach'?{zone:Z.GRAVE,sequence:0,is_overlay:false,position:0}:name==='reattach'?{zone:Z.MZONE,sequence:2,is_overlay:true,overlay_sequence:2}:name==='leave'?{zone:Z.EXTRA,sequence:0,position:3}:{zone:Z.MZONE,sequence:2,position:2})});
  await moveMaterialTest(getUIContainer(),new api.ygopro.StocGameMessage.MsgMove({code:target.code,from:new api.ygopro.CardLocation(target.location.toObject()),to,reason:0}));
 },
 practice(count,player,defense,detached,order){
  window.__round4.board();const r=window.__round4;const host=r.frame.cards.find(c=>c.player===player&&c.location===4);host.position=defense?4:1;
  host.overlay=Array.from({length:count},(_,i)=>i%2?46986414:26202165);r.frame.cards=r.frame.cards.filter(c=>c===host);
  if(detached){r.frame.cards=[];r.frame.materials=order.filter(i=>i<count).map(i=>({index:i,atOrigin:false,host:{player,location:4,sequence:2},card:{...host,sceneId:'material-'+i,code:host.overlay[i],overlay:[]}}));}
  r.renderBoard();
 }
};`;

function materialHits(nodes) {
  return nodes.map((el) => {
    const r = el.getBoundingClientRect();
    let point,
      bestWidth = -1;
    for (const row of [0.5, 0.12, 0.88]) {
      const y = Math.round(r.top + r.height * row);
      let start;
      for (let x = r.left + 0.25; x <= r.right + 0.25; x += 0.25) {
        if (x < r.right && el.contains(document.elementFromPoint(x, y))) {
          start ??= x;
          continue;
        }
        if (start !== undefined) {
          const end = x - 0.25,
            width = end - start;
          if (width > bestWidth) {
            const middle = (start + end) / 2,
              integer = Math.round(middle);
            point = {
              x: integer >= start && integer <= end ? integer : middle,
              y,
            };
            bestWidth = width;
          }
          start = undefined;
        }
      }
    }
    return {
      index: Number(el.dataset.cardOverlaySequence ?? el.dataset.overlayIndex),
      code: Number(el.dataset.cardCode),
      height: parseFloat(el.style.height),
      zIndex: getComputedStyle(el).zIndex,
      box: r.toJSON(),
      matrix: Array.from(
        new DOMMatrixReadOnly(getComputedStyle(el).transform).toFloat64Array(),
      ),
      point,
    };
  });
}
let browser, server;
const evidence = [];
try {
  if (!process.argv.includes("--built")) {
    await build({
      logLevel: "error",
      build: { outDir },
      plugins: [
        {
          name: "material-layers-test-only",
          transform(code, id) {
            if (id.replaceAll("\\", "/").endsWith("/src/main.tsx"))
              return code + fixture;
          },
        },
      ],
    });
    execFileSync(process.execPath, ["scripts/copy_assets.mjs", outDir], {
      stdio: "inherit",
    });
  }
  server = await preview({
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 },
  });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const smoke = process.argv.includes("--smoke");
  const countArg = process.argv.find((a) => a.startsWith("--count="));
  const counts = countArg
    ? [Number(countArg.slice(8))]
    : smoke
    ? [2]
    : [2, 3, 6];
  for (const [width, height] of smoke
    ? [[844, 390]]
    : [
        [1440, 900],
        [844, 390],
        [568, 320],
        [390, 844],
        [320, 568],
      ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: width < 1000,
      isMobile: width < 1000,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem("language", "cn"));
    try {
      await page.goto(server.resolvedUrls.local[0], {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 60000,
      });
      if (!process.argv.includes("--practice-only"))
        for (const count of counts)
          for (const player of [0, 1])
            for (const defense of [false, true])
              for (const direction of smoke
                ? ["forward", "reverse"]
                : ["forward", "reverse", "mixed"]) {
                let order = Array.from({ length: count + 1 }, (_, i) => i);
                if (direction === "reverse") order.reverse();
                if (direction === "mixed")
                  order = [
                    ...order.filter((i) => i < count && i % 2),
                    count,
                    ...order.filter((i) => i < count && !(i % 2)),
                  ];
                await page.evaluate(
                  (args) => window.__materialLayers.online(...args),
                  [count, player, defense, order],
                );
                const mats = page.locator(
                  '[data-testid="duel-card"][data-card-is-overlay="true"]',
                );
                await expect(mats).toHaveCount(count);
                await page.waitForTimeout(550);
                const hit = await mats.evaluateAll(materialHits);
                const label = {
                  kind: "online",
                  width,
                  height,
                  count,
                  player,
                  defense,
                  direction,
                  hit,
                };
                evidence.push(label);
                assert.ok(
                  hit.every((m) => m.point),
                  "Each online material exposes its own clickable edge: " +
                    JSON.stringify(label),
                );
                const host = page.locator(
                  '[data-testid="duel-card"][data-card-is-overlay="false"]',
                );
                const expectedHeight = width > height ? 88 : 120;
                assert.equal(
                  await host.evaluate((e) => parseFloat(e.style.height)),
                  expectedHeight,
                );
                const slot = await page
                  .locator(
                    '[data-testid="duel-zone"][data-zone="MZONE"][data-sequence="2"][data-controller="' +
                      player +
                      '"]',
                  )
                  .boundingBox();
                for (const m of hit) {
                  assert.ok(Number.isInteger(Number(m.zIndex)));
                  assert.equal(Number(m.zIndex), 2 - count + m.index);
                  assert.ok(
                    Math.abs(m.matrix[1]) < 0.001,
                    "Materials stay portrait",
                  );
                  assert.equal(m.height, expectedHeight);
                  assert.ok(
                    m.box.x >= slot.x - 1 &&
                      m.box.x + m.box.width <= slot.x + slot.width + 1 &&
                      m.box.y >= slot.y - 1 &&
                      m.box.bottom <= slot.y + slot.height + 1,
                    "Material stays within its monster slot",
                  );
                  if (smoke || (direction === "reverse" && defense)) {
                    await page.mouse.click(m.point.x, m.point.y);
                    await expect(
                      page.getByTestId("duel-card-detail"),
                    ).toHaveAttribute("data-card-code", String(m.code));
                    await page.getByTestId("duel-card-panel-close").click();
                    await expect(
                      page.getByTestId("duel-card-panel"),
                    ).not.toBeVisible();
                  }
                }
                if (direction === "reverse" && player === 1 && defense)
                  await page.screenshot({
                    path: folder + "/online-" + width + "-" + count + ".png",
                  });
                if (direction === "mixed" && player === 1 && defense)
                  console.log(
                    "PASS online material count",
                    width,
                    height,
                    count,
                  );
              }
      if (!smoke && !process.argv.includes("--practice-only"))
        for (const player of [0, 1]) {
          await page.evaluate(
            (args) => window.__materialLayers.online(...args),
            [3, player, false, [3, 2, 1, 0]],
          );
          await page.waitForTimeout(550);
          for (const step of [
            "focus",
            "position",
            "detach",
            "reattach",
            "leave",
            "return",
            "focus",
          ]) {
            await page.evaluate(
              (step) => window.__materialLayers.step(step),
              step,
            );
            await page.waitForTimeout(250);
            if (step === "leave") continue;
            const mats = page.locator(
              '[data-testid="duel-card"][data-card-is-overlay="true"]',
            );
            const count = step === "detach" ? 2 : 3;
            await expect(mats).toHaveCount(count);
            const hit = await mats.evaluateAll(materialHits);
            evidence.push({
              kind: "transition",
              width,
              height,
              player,
              step,
              hit,
            });
            assert.ok(
              hit.every((m) => m.point),
              "Every material is clickable after " + step,
            );
            assert.ok(
              hit.every(
                (m) =>
                  Number.isInteger(Number(m.zIndex)) &&
                  Number(m.zIndex) === 2 - count + m.index,
              ),
            );
            const host = page.locator(
              '[data-testid="duel-card"][data-card-zone="MZONE"][data-card-is-overlay="false"]',
            );
            await expect(host).toHaveCSS("z-index", "3");
            await expect(page.getByTestId("duel-material-count")).toHaveText(
              String(count),
            );
            if (step === "return")
              for (const m of hit) {
                await page.mouse.click(m.point.x, m.point.y);
                await expect(
                  page.getByTestId("duel-card-detail"),
                ).toHaveAttribute("data-card-code", String(m.code));
                await page.getByTestId("duel-card-panel-close").click();
                await expect(
                  page.getByTestId("duel-card-panel"),
                ).not.toBeVisible();
              }
          }
        }
      if (
        !process.argv.includes("--online-only") &&
        !process.argv.includes("--transitions-only")
      )
        for (const count of counts)
          for (const player of [0, 1])
            for (const defense of [false, true])
              for (const detached of [false, true]) {
                const order = Array.from(
                  { length: count },
                  (_, i) => count - 1 - i,
                );
                await page.evaluate(
                  (args) => window.__materialLayers.practice(...args),
                  [count, player, defense, detached, order],
                );
                const mats = page.locator(
                  '.practice-positioned-card[data-location="132"]',
                );
                await expect(mats).toHaveCount(count);
                await page.waitForTimeout(200);
                const hit = await mats.evaluateAll(materialHits);
                const label = {
                  kind: "practice",
                  width,
                  height,
                  count,
                  player,
                  defense,
                  detached,
                  hit,
                };
                evidence.push(label);
                assert.ok(
                  hit.every((m) => m.point),
                  "Each practice material exposes its own clickable edge: " +
                    JSON.stringify(label),
                );
                const slot = await page
                  .locator(
                    '[data-testid="practice-slot"][data-location="4"][data-sequence="2"][data-player="' +
                      player +
                      '"]',
                  )
                  .boundingBox();
                // Shared layering: consecutive by index (inner covers outer),
                // all below the host card.
                const host = page.locator(
                  '.practice-positioned-card[data-player="' +
                    player +
                    '"][data-location="4"][data-sequence="2"]',
                );
                // Detached materials are staged before their host exists.
                const hostLayer = (await host.count())
                  ? Number(await host.evaluate((el) => el.style.zIndex))
                  : Infinity;
                for (const m of hit) {
                  assert.equal(
                    Number(m.zIndex) - Number(hit[0].zIndex),
                    m.index - hit[0].index,
                  );
                  assert.ok(Number(m.zIndex) < hostLayer, "Materials stay under their host");
                  assert.equal(
                    m.code,
                    m.index % 2 ? 46986414 : 26202165,
                    "Material identity follows its index, independent of source order",
                  );
                  assert.ok(Math.abs(m.matrix[1]) < 0.001);
                  assert.equal(m.height, width > height ? 88 : 120);
                  assert.ok(
                    m.box.x >= slot.x - 1 &&
                      m.box.x + m.box.width <= slot.x + slot.width + 1,
                  );
                  await page.mouse.click(m.point.x, m.point.y);
                }
                assert.deepEqual(
                  await page.evaluate(() => window.__round4.inspected),
                  hit.map((m) => m.code),
                  "Each practice click reaches that material",
                );
                if (detached && player === 1 && defense)
                  await page.screenshot({
                    path: folder + "/practice-" + width + "-" + count + ".png",
                  });
                if (detached && player === 1 && defense)
                  console.log(
                    "PASS practice material count",
                    width,
                    height,
                    count,
                  );
                await page.evaluate(() => window.__round4.unmount());
              }
      if (!process.argv.includes("--online-only"))
        for (const player of [0, 1]) {
          await page.evaluate(
            (args) => window.__materialLayers.practice(...args),
            [2, player, false, false, [1, 0]],
          );
          await page.evaluate(() => {
            const r = window.__round4,
              host = r.frame.cards[0];
            r.frame.cards.push(
              ...[0, 1].map((player) => ({
                ...host,
                sceneId: "hand-" + player,
                player,
                location: 2,
                sequence: 0,
                overlay: [],
              })),
            );
          });
          for (const count of [6, 3, 2]) {
            await page.evaluate((count) => {
              const r = window.__round4,
                host = r.frame.cards.find((c) => c.location === 4);
              host.overlay = Array.from({ length: count }, (_, i) =>
                i % 2 ? 46986414 : 26202165,
              );
              host.position = count === 3 ? 4 : 1;
              r.inspected = [];
              r.renderBoard();
            }, count);
            const mats = page.locator(
              '.practice-positioned-card[data-location="132"]',
            );
            await expect(mats).toHaveCount(count);
            await page.waitForTimeout(200);
            const hit = await mats.evaluateAll(materialHits);
            evidence.push({
              kind: "practice-count-change",
              width,
              height,
              player,
              count,
              hit,
            });
            assert.ok(hit.every((m) => m.point));
            // Shared layering: host above its materials, hand above the field.
            const hostLayer = Number(
              await page
                .locator('.practice-positioned-card[data-location="4"]')
                .evaluate((el) => getComputedStyle(el).zIndex),
            );
            assert.ok(hit.every((m) => Number(m.zIndex) < hostLayer));
            for (const hand of await page
              .locator('.practice-positioned-card[data-location="2"]')
              .all())
              assert.ok(
                Number(await hand.evaluate((el) => getComputedStyle(el).zIndex)) >
                  hostLayer,
              );
            for (const m of hit) await page.mouse.click(m.point.x, m.point.y);
            assert.deepEqual(
              await page.evaluate(() => window.__round4.inspected),
              hit.map((m) => m.code),
            );
          }
          await page.evaluate(() => window.__round4.unmount());
        }
      assert.deepEqual(errors, []);
      console.log("PASS independent material layers", width, height);
    } catch (e) {
      await page
        .screenshot({
          path: folder + "/failure-" + width + ".png",
          timeout: 5000,
        })
        .catch(() => {});
      throw e;
    } finally {
      await page.close();
    }
  }
} finally {
  writeFileSync(
    folder +
      (process.argv.includes("--practice-only")
        ? "/practice-evidence.json"
        : process.argv.includes("--online-only")
        ? "/online-evidence.json"
        : "/evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  await browser?.close();
  await server?.httpServer.close();
}
