import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const folder = ".audit-tmp/practice-chain-modes-ui";
mkdirSync(folder, { recursive: true });
let server, browser;
try {
  server = process.env.SMOKE_URL ? undefined : await preview({build:{outDir:process.env.PRACTICE_TEST_DIST || 'dist'},preview:{host:'127.0.0.1',port:0}});
  const origin = process.env.SMOKE_URL || server.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: width < height,
      isMobile: width < height,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("language", "cn");
      window.__chainTrace = { sent: [], frames: [] };
      const Native = Worker;
      window.Worker = class extends Native {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", ({ data }) => {
            if (data.type === "frame") {
              window.__chainTrace.frame = data.frame;
              window.__chainTrace.frames.push(data.frame);
            }
          });
        }
        postMessage(data, ...args) {
          window.__chainTrace.sent.push(data);
          super.postMessage(data, ...args);
        }
      };
    });
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 60000,
      });
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const opening = indexedDB.open("decks");
            opening.onerror = () => reject(opening.error);
            opening.onsuccess = () => {
              const database = opening.result;
              const transaction = database.transaction("decks", "readwrite");
              const decks = transaction.objectStore("decks");
              decks.clear();
              decks.put(
                {
                  deckName: "Empty chain fixture",
                  main: Array(40).fill(26202165),
                  extra: [],
                  side: [],
                },
                "Empty chain fixture",
              );
              transaction.oncomplete = () => {
                database.close();
                resolve();
              };
            };
          }),
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 60000,
      });
      await page.getByRole('button',{name:'设置',exact:true}).click();
      if(width>600)await page.getByTestId('settings-navigation').getByRole('button').first().click();await page.getByTestId('setting-chain-0').check();
      await page.getByTestId('settings-close').click();
      await page.evaluate(()=>location.hash='#/practice');
      const choices = page.getByTestId("practice-choices");
      await expect(choices).toContainText("此时没有可以发动的效果", {
        timeout: 60000,
      });
      await expect(choices).toContainText("是否要确认场上的情况？");
      const pending = await page.evaluate(
        () => window.__chainTrace.frame.pending,
      );
      assert.equal(pending.kind, "chain");
      assert.deepEqual(pending.choices, []);
      const responseCount = () =>
        page.evaluate(
          () =>
            window.__chainTrace.sent.filter((entry) => entry.type === "respond")
              .length,
        );
      assert.equal(await responseCount(), 0);
      await page.getByTestId("practice-chain-inspect").click();
      await expect(choices).not.toBeVisible();
      const continuation = page.getByTestId("practice-chain-continue");
      await expect(continuation).toBeVisible();
      assert.equal(
        await responseCount(),
        0,
        "Yes inspects the board without responding",
      );
      assert.equal(
        await page.evaluate(() => window.__chainTrace.frame.pending.id),
        pending.id,
      );
      const board = await page.getByTestId("practice-board").boundingBox();
      const header = await continuation.boundingBox();
      if (width < height)
        assert.ok(
          board &&
            header &&
            (header.y >= board.y + board.height - 1 ||
              header.y + header.height <= board.y + 1),
          "Portrait continuation has independent space outside the board",
        );
      await page.screenshot({ path: `${folder}/inspect-${width}.png` });
      await continuation.click();
      await expect.poll(() => responseCount()).toBe(1);
      const sent = await page.evaluate(() =>
        window.__chainTrace.sent.filter((entry) => entry.type === "respond"),
      );
      assert.deepEqual(
        [sent[0].id, sent[0].player, sent[0].answer, sent[0].chainMode],
        [pending.id, pending.player, -1, 0],
      );
      await page.waitForFunction(
        (id) => window.__chainTrace.frame.pending?.id !== id,
        pending.id,
      );
      await expect(choices).toBeVisible();
      await expect(continuation).not.toBeVisible();
      const nextId = await page.evaluate(
        () => window.__chainTrace.frame.pending.id,
      );
      await choices.getByTestId("practice-cancel").click();
      await expect.poll(() => responseCount()).toBe(2);
      await page.waitForFunction(
        (id) => window.__chainTrace.frame.pending?.id !== id,
        nextId,
      );
      if(await choices.isVisible())await page.locator('.ant-modal:visible .ant-modal-close').click();
      await page.getByTestId('practice-settings').click();
      await page.getByTestId('setting-chain-2').check();
      await page.getByTestId('settings-close').click();
      await page.waitForFunction(
        () => window.__chainTrace.frame.pending?.kind === "idle",
      );
      await expect(choices).not.toBeVisible();
      await page.getByTestId("phase-ep").click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.__chainTrace.sent.some(
              (entry) => entry.type === "respond" && entry.chainMode === 2,
            ),
          ),
        )
        .toBe(true);
      const commands = await page.evaluate(() => window.__chainTrace.sent);
      assert.ok(
        commands
          .filter((entry) => ["open", "next", "respond"].includes(entry.type))
          .every((entry) => [0, 2].includes(entry.chainMode)),
        "Every worker command carries the current mode",
      );
      assert.ok(
        commands.some(
          (entry) => entry.type === "respond" && entry.chainMode === 2,
        ),
        "Changing settings applies to the pending request",
      );
      assert.deepEqual(errors, []);
      console.log(
        "PASS real Worker empty-chain Yes/inspect/continue, No/pass, setting update and request reset",
        width,
        height,
      );
    } catch (error) {
      await page.screenshot({ path: `${folder}/failure-${width}.png` });
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server?.httpServer.close();
}
