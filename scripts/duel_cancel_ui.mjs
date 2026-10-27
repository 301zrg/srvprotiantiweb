// Synthetic requests and fake transport; never joins production rooms.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const output = ".audit-tmp/duel-cancel";
mkdirSync(output, { recursive: true });
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
let vite, browser, currentPage;
const reports = [];
try {
  if (!process.argv.includes("--built")) {
    await build({
      logLevel: "error",
      build: { outDir: `${output}/client` },
      plugins: [
        {
          name: "duel-cancel-test-only-hooks",
          transform(code, id) {
            if (!id.replace(/\\/g, "/").endsWith("/src/main.tsx")) return;
            return (
              code +
              `
          import * as compat from "@/container/compat";
          import * as stores from "@/stores";
          import * as api from "@/api";
          import * as gen from "@/service/utils/genCard";
          import handleGameMsg from "@/service/duel/gameMsg";
          import * as request from "@/service/duel/actionRequest";
          import * as messages from "@/ui/Duel/Message";
          import * as settings from "@/stores/settingStore";
          import * as settingPanel from "@/ui/Setting";
          import * as diagnostics from "@/variant/duelDiagnostics";
          window.__cancelTest = { compat, stores, api, gen, handleGameMsg, request, messages, settings, settingPanel, diagnostics };
        `
            );
          },
        },
      ],
    });
    cpSync("neos-assets", `${output}/client/neos-assets`, { recursive: true });
  }
  vite = await preview({
    build: { outDir: `${output}/client` },
    preview: { host: "127.0.0.1", port: 0 },
  });
  const origin = vite.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    executablePath: existsSync(edge) ? edge : undefined,
  });
  for (const [profile, width, height, touch] of [
    ["desktop", 1280, 800, false],
    ["portrait", 390, 844, true],
    ["landscape", 844, 390, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort(),
    );
    await context.route(
      /https?:\/\/(?!127\.0\.0\.1).*\.(jpg|png)(\?.*)?$/,
      (route) =>
        route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6AAAASUVORK5CYII=",
            "base64",
          ),
        }),
    );
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};',
      }),
    );
    await context.addInitScript(() => {
      if (!localStorage.getItem("language"))
        localStorage.setItem("language", "cn");
    });
    const page = await context.newPage();
    currentPage = page;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 90000,
    });
    assert.equal(
      await page.evaluate(
        () => window.__cancelTest.settings.settingStore.confirmOperations,
      ),
      false,
      "Missing settings migrate to OFF",
    );
    await page.evaluate(() => {
      const test = window.__cancelTest;
      const { ygopro, fetchCard } = test.api;
      const packets = [],
        abort = new AbortController();
      const ws = new EventTarget();
      ws.readyState = 1;
      ws.send = (bytes) => packets.push([...new Uint8Array(bytes)]);
      test.compat.initUIContainer({ ws, signal: abort.signal });
      const container = test.compat.getUIContainer();
      const { matStore, roomStore, cardStore, historyStore } = test.stores;
      matStore.reset();
      cardStore.reset();
      historyStore.reset();
      matStore.selfType = 1;
      matStore.currentPlayer = 0;
      matStore.initInfo.me.life = matStore.initInfo.op.life = 8000;
      roomStore.joined = false;
      roomStore.players = [
        { name: "Test A", isMe: true, state: 0 },
        { name: "Test B", isMe: false, state: 0 },
      ];
      const card = (uuid, code, zone, sequence) =>
        test.gen.genCard({
          uuid,
          code,
          meta: fetchCard(code),
          location: new ygopro.CardLocation({
            controller: 0,
            zone,
            sequence,
            is_overlay: false,
            position: 0,
          }),
          counters: {},
          status: 0,
          targeted: false,
          isToken: false,
          idleInteractivities: [],
          selectInfo: { selectable: false, selected: false },
        });
      const hand = card("hand", 89631139, ygopro.CardZone.HAND, 0);
      const extra = card("extra", 54719828, ygopro.CardZone.EXTRA, 0);
      const field = card("field", 54719828, ygopro.CardZone.MZONE, 0);
      cardStore.inner.push(hand, extra, field);
      const ask = (kind, value) =>
        test.handleGameMsg(
          container,
          new ygopro.YgoStocMsg({
            stoc_game_msg: new ygopro.StocGameMessage({ [kind]: value }),
          }),
        );
      const idle = (kind = "SUMMON", card = hand, count = 1) => {
        matStore.phase.currentPhase =
          ygopro.StocGameMessage.MsgNewPhase.PhaseType.MAIN1;
        const Cmd = ygopro.StocGameMessage.MsgSelectIdleCmd.IdleCmd;
        return ask(
          "select_idle_cmd",
          new ygopro.StocGameMessage.MsgSelectIdleCmd({
            player: 0,
            enable_bp: true,
            enable_ep: true,
            idle_cmds: [
              new Cmd({
                idle_type: Cmd.IdleType[kind],
                idle_datas: Array.from(
                  { length: count },
                  (_, i) =>
                    new Cmd.IdleData({
                      card_info: new ygopro.CardInfo({
                        location: card.location.zone,
                        sequence: card.location.sequence,
                      }),
                      response:
                        (i << 16) +
                        {
                          SUMMON: 0,
                          SPSUMMON: 1,
                          POS_CHANGE: 2,
                          MSET: 3,
                          SSET: 4,
                          ACTIVATE: 5,
                        }[kind],
                      effect_description: 54719828 * 16 + i,
                    }),
                ),
              }),
            ],
          }),
        );
      };
      const battle = (kind = "ATTACK", count = 1) => {
        matStore.phase.currentPhase =
          ygopro.StocGameMessage.MsgNewPhase.PhaseType.BATTLE;
        const Cmd = ygopro.StocGameMessage.MsgSelectBattleCmd.BattleCmd;
        return ask(
          "select_battle_cmd",
          new ygopro.StocGameMessage.MsgSelectBattleCmd({
            player: 0,
            enable_m2: true,
            enable_ep: true,
            battle_cmds: [
              new Cmd({
                battle_type: Cmd.BattleType[kind],
                battle_datas: Array.from(
                  { length: count },
                  (_, i) =>
                    new Cmd.BattleData({
                      card_info: new ygopro.CardInfo({
                        location: field.location.zone,
                        sequence: 0,
                      }),
                      response: (i << 16) + (kind === "ATTACK" ? 1 : 0),
                      effect_description: 54719828 * 16 + i,
                    }),
                ),
              }),
            ],
          }),
        );
      };
      const responseValues = () =>
        packets
          .filter((p) => p[2] === 1)
          .map((p) =>
            new DataView(Uint8Array.from(p).buffer).getInt32(3, true),
          );
      window.__fixture = {
        container,
        packets,
        abort,
        ws,
        idle,
        battle,
        ask,
        responseValues,
        hand,
        extra,
        field,
      };
      location.hash = "#/duel";
    });
    await expect(page.getByTestId("duel-menu")).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(1100); // Existing NeosModal initialization workaround.
    const values = () => page.evaluate(() => window.__fixture.responseValues());
    const visible = (id) => page.locator(`[data-testid="${id}"]:visible`);
    const openAction = async (uuid, action) => {
      await page.waitForTimeout(350); // Wait for the closing modal's mask animation.
      for (const id of ["duel-card-panel-close", "duel-card-list-panel-close"]) {
        const close = page.getByTestId(id);
        if (await close.isVisible()) await close.click();
      }
      const trigger = page.locator(
        `[data-testid="duel-card"][data-card-uuid="${uuid}"] [data-testid="duel-card-trigger"]`,
      );
      if (touch) await trigger.tap();
      else await trigger.click();
      await page
        .locator(`[data-testid="duel-action-${action}"]:visible`)
        .click();
    };
    const resetPackets = () =>
      page.evaluate(() => {
        window.__fixture.packets.length = 0;
      });
    // All active idle actions keep their exact integer response with confirmation off.
    for (const [kind, action, response] of [
      ["SUMMON", "summon", 0],
      ["SPSUMMON", "sp_summon", 1],
      ["POS_CHANGE", "pos_change", 2],
      ["MSET", "mset", 3],
      ["SSET", "sset", 4],
      ["ACTIVATE", "activate", 5],
    ]) {
      await resetPackets();
      await page.evaluate((kind) => window.__fixture.idle(kind), kind);
      await openAction("hand", action);
      await expect.poll(values).toEqual([response]);
    }
    // The same action can be cancelled, retried, and submitted only once.
    await resetPackets();
    await page.evaluate(() => {
      window.__cancelTest.settings.settingStore.confirmOperations = true;
      return window.__fixture.idle();
    });
    await openAction("hand", "summon");
    await expect(page.getByTestId("duel-action-confirm")).toBeVisible();
    assert.deepEqual(await values(), []);
    await expect
      .poll(
        async () =>
          (await page.getByTestId("duel-action-confirm").boundingBox())?.height,
      )
      .toBeGreaterThanOrEqual(43.9);
    const button = await page.getByTestId("duel-action-confirm").boundingBox();
    assert.ok(
      button.x >= 0 && button.y + button.height <= height,
      JSON.stringify({ profile, button }),
    );
    await page.screenshot({ path: `${output}/confirm-${profile}.png` });
    await page.getByTestId("duel-action-cancel").click();
    assert.deepEqual(await values(), []);
    assert.equal(
      await page.evaluate(
        () => window.__fixture.hand.idleInteractivities.length,
      ),
      1,
    );
    await openAction("hand", "summon");
    await page.getByTestId("duel-action-confirm").evaluate((el) => {
      el.click();
      el.click();
    });
    await expect.poll(values).toEqual([0]);
    // New requests and unexpected disconnects invalidate an already open draft.
    for (const invalidate of ["request", "close"]) {
      await resetPackets();
      await page.evaluate(() => {
        const f = window.__fixture;
        f.ws.readyState = 1;
        return f.idle();
      });
      await openAction("hand", "summon");
      await page.evaluate((invalidate) => {
        const f = window.__fixture,
          test = window.__cancelTest;
        if (invalidate === "request")
          test.request.beginActionRequest(f.container);
        if (invalidate === "close") {
          f.ws.readyState = 3;
          f.ws.dispatchEvent(new Event("close"));
        }
      }, invalidate);
      await expect(page.getByTestId("duel-action-confirm")).not.toBeVisible();
      assert.deepEqual(await values(), []);
    }
    // The remaining fixtures use the currently registered container explicitly.
    await page.evaluate(() => {
      const f = window.__fixture,
        test = window.__cancelTest;
      f.container = test.compat.getUIContainer();
      f.ws.readyState = 1;
      f.ask = (kind, value) =>
        test.handleGameMsg(
          f.container,
          new test.api.ygopro.YgoStocMsg({
            stoc_game_msg: new test.api.ygopro.StocGameMessage({
              [kind]: value,
            }),
          }),
        );
      test.request.beginActionRequest(f.container);
      test.settings.settingStore.confirmOperations = false;
    });
    // Active effect candidate cancellation sends no SELECT_OPTION packet.
    await resetPackets();
    await page.evaluate(() => {
      const f = window.__fixture;
      window.__cancelTest.request.beginActionRequest(f.container, "battle");
      f.field.idleInteractivities = [0, 65536].map((response) => ({
        interactType: window.__cancelTest.stores.InteractType.ACTIVATE,
        response,
        responseSource: "battle",
        activateIndex: 54719828 * 16,
      }));
    });
    await openAction("field", "activate");
    await expect(page.getByTestId("duel-active-option-cancel")).toBeVisible();
    await page.getByTestId("duel-active-option-cancel").click();
    assert.deepEqual(await values(), []);
    await openAction("field", "activate");
    await page
      .locator('[data-testid="duel-option-item"][data-option-response="65536"]')
      .click();
    await page.getByTestId("duel-option-reset").click();
    await expect(page.getByTestId("duel-option-submit")).toBeDisabled();
    assert.deepEqual(await values(), []);
    await page
      .locator('[data-testid="duel-option-item"][data-option-response="65536"]')
      .click();
    await page.getByTestId("duel-option-submit").click();
    await expect.poll(values).toEqual([65536]);
    // Zone candidate cancellation used to dereference the empty result.
    await resetPackets();
    await page.evaluate(() => {
      const f = window.__fixture;
      window.__cancelTest.request.beginActionRequest(f.container);
      f.extra.idleInteractivities = [
        {
          interactType: window.__cancelTest.stores.InteractType.ACTIVATE,
          response: 5,
        },
      ];
    });
    await openAction("extra", "activate");
    await expect(page.getByTestId("duel-select-card-cancel")).toBeVisible();
    await page.getByTestId("duel-select-card-cancel").click();
    assert.deepEqual(await values(), []);
    // Mandatory option reset keeps the prompt open, with no false cancel.
    await page.evaluate(() => {
      window.__fixture.optionPromise =
        window.__cancelTest.messages.displayOptionModal(
          "Required",
          [
            { info: "One", response: 0 },
            { info: "Two", response: 1 },
          ],
          1,
        );
    });
    await expect(
      page.getByTestId("duel-active-option-cancel"),
    ).not.toBeVisible();
    await page
      .locator('[data-testid="duel-option-item"][data-option-response="1"]')
      .click();
    await page.getByTestId("duel-option-reset").click();
    await expect(page.getByTestId("duel-option-submit")).toBeDisabled();
    assert.deepEqual(await values(), []);
    await page
      .locator('[data-testid="duel-option-item"][data-option-response="1"]')
      .click();
    await page.getByTestId("duel-option-submit").click();
    await expect.poll(values).toEqual([1]);
    // Sparse arrays and uncontrolled inputs used to make counter drafts unreliable.
    await resetPackets();
    await page.evaluate(() => {
      window.__fixture.counterPromise =
        window.__cancelTest.messages.displayCheckCounterModal({
          min: 2,
          counterType: 1,
          options: [
            { code: 54719828, max: 2 },
            { code: 89631139, max: 2 },
          ],
        });
    });
    const counters = page.getByTestId("duel-counter-value");
    await counters.nth(0).fill("1");
    await counters.nth(1).fill("1");
    await expect(page.getByTestId("duel-counter-submit")).toBeEnabled();
    await page.getByTestId("duel-counter-reset").click();
    await expect(counters.nth(0)).toHaveValue("0");
    await expect(counters.nth(1)).toHaveValue("0");
    await expect(page.getByTestId("duel-counter-submit")).toBeDisabled();
    assert.deepEqual(await values(), []);
    await counters.nth(1).fill("2");
    await page.getByTestId("duel-counter-submit").click();
    assert.deepEqual(
      await page.evaluate(() =>
        window.__fixture.packets
          .filter((p) => p[2] === 1)
          .at(-1)
          .slice(3),
      ),
      [0, 0, 2, 0],
    );
    // Card draft reset preserves the mandatory and previously accepted cards.
    await resetPackets();
    await page.evaluate(() => {
      const f = window.__fixture;
      const option = (card, response) => ({
        meta: card.meta,
        location: card.location,
        response,
      });
      f.cardsPromise = window.__cancelTest.messages.displaySelectActionsModal({
        min: 1,
        max: 1,
        single: false,
        cancelable: false,
        finishable: false,
        totalLevels: 0,
        overflow: true,
        selectables: [option(f.hand, 1)],
        mustSelects: [option(f.field, 0)],
        selecteds: [option(f.extra, 2)],
      });
    });
    await visible("duel-select-card-option").click();
    await expect(visible("duel-select-card-submit")).toBeEnabled();
    await visible("duel-select-card-reset").click();
    await expect(visible("duel-select-card-submit")).toBeDisabled();
    await expect(visible("duel-select-card-cancel")).toHaveCount(0);
    assert.deepEqual(await values(), []);
    await visible("duel-select-card-option").click();
    await visible("duel-select-card-submit").click();
    assert.deepEqual(
      await page.evaluate(() =>
        window.__fixture.packets
          .filter((p) => p[2] === 1)
          .at(-1)
          .slice(3),
      ),
      [2, 0, 1],
    );
    // Keyboard dragging changes a real DnD draft, including response index 0.
    await resetPackets();
    await page.evaluate(() => {
      const f = window.__fixture;
      f.sortPromise = window.__cancelTest.messages.displaySortCardModal(
        [f.hand, f.field].map((card, response) => ({
          meta: card.meta,
          response,
        })),
      );
    });
    const sorted = page.getByTestId("duel-sort-item");
    await page.waitForTimeout(350); // Measure stable rectangles after modal entry.
    await sorted.nth(0).focus();
    await page.keyboard.press("Space");
    await expect(sorted.nth(0)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(120);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(120);
    await page.keyboard.press("Space");
    await expect
      .poll(() =>
        sorted.evaluateAll((els) =>
          els.map((el) => Number(el.dataset.sortResponse)),
        ),
      )
      .toEqual([1, 0]);
    await page.waitForTimeout(200); // Sensor cleanup briefly suppresses clicks after a drop.
    await page.getByTestId("duel-sort-reset").click();
    await expect
      .poll(() =>
        sorted.evaluateAll((els) =>
          els.map((el) => Number(el.dataset.sortResponse)),
        ),
      )
      .toEqual([0, 1]);
    assert.deepEqual(await values(), []);
    await page.getByTestId("duel-sort-submit").click();
    assert.deepEqual(
      await page.evaluate(() =>
        window.__fixture.packets
          .filter((p) => p[2] === 1)
          .at(-1)
          .slice(3),
      ),
      [0, 1],
    );
    // Card declaration reset keeps the mandatory question and its search results.
    await resetPackets();
    await page.evaluate(() => {
      window.__fixture.announcePromise =
        window.__cancelTest.messages.displayAnnounceModal([
          89631139, 0x40000100,
        ]);
    });
    const cardName = await page.evaluate(
      () => window.__cancelTest.api.fetchCard(89631139).text.name,
    );
    await page.getByTestId("duel-announce-search").fill(cardName);
    await page.getByTestId("duel-announce-search-submit").click();
    await page
      .getByTestId("duel-announce-card-option")
      .first()
      .locator("input")
      .check();
    await expect(page.getByTestId("duel-announce-submit")).toBeEnabled();
    await page.getByTestId("duel-announce-reset").click();
    await expect(page.getByTestId("duel-announce-submit")).toBeDisabled();
    assert.deepEqual(await values(), []);
    await page
      .getByTestId("duel-announce-card-option")
      .first()
      .locator("input")
      .check();
    await page.getByTestId("duel-announce-submit").click();
    await expect.poll(values).toEqual([89631139]);
    // Battle attack and phase changes also wait for confirmation.
    await resetPackets();
    await page.evaluate(() => {
      window.__cancelTest.settings.settingStore.confirmOperations = true;
      return window.__fixture.battle();
    });
    await openAction("field", "attack");
    await page.getByTestId("duel-action-cancel").click();
    assert.deepEqual(await values(), []);
    await openAction("field", "attack");
    await page.getByTestId("duel-action-confirm").click();
    await expect.poll(values).toEqual([1]);
    await resetPackets();
    await page.evaluate(() => window.__fixture.battle());
    await page.getByTestId("duel-phase-select").click();
    await page.getByTestId("duel-phase-main2").click();
    await page.getByTestId("duel-action-cancel").click();
    assert.deepEqual(await values(), []);
    await page.getByTestId("duel-phase-select").click();
    await page.getByTestId("duel-phase-main2").click();
    await page.getByTestId("duel-action-confirm").click();
    await expect.poll(values).toEqual([2]);
    // Aborting the original connection closes the modal without submitting.
    await resetPackets();
    await page.evaluate(() => window.__fixture.idle());
    await openAction("hand", "summon");
    await page.evaluate(() => window.__fixture.abort.abort());
    await expect(page.getByTestId("duel-action-confirm")).not.toBeVisible();
    assert.deepEqual(await values(), []);
    await page.evaluate(() => {
      window.__cancelTest.settings.settingStore.confirmOperations = false;
    });
    // Settings and diagnostics work in all languages, and persist across refresh.
    const labels = {
      cn: "操作前确认",
      en: "Confirm actions before sending",
      ja: "操作を送信する前に確認",
      ko: "조작 전 확인",
    };
    for (const [language, label] of Object.entries(labels)) {
      await page.evaluate((language) => {
        localStorage.setItem("language", language);
        location.reload();
      }, language);
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 90000,
      });
      await page.evaluate(() =>
        window.__cancelTest.settingPanel.openSettingPanel({
          defaultKey: "operations",
        }),
      );
      await expect(
        page.getByRole("checkbox", { name: label, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByTestId("confirm-operations-setting"),
      ).not.toBeChecked();
      await page.getByTestId("confirm-operations-setting").click();
      await page.evaluate(() => location.reload());
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 90000,
      });
      await page.evaluate(() =>
        window.__cancelTest.settingPanel.openSettingPanel({
          defaultKey: "operations",
        }),
      );
      await expect(
        page.getByTestId("confirm-operations-setting"),
      ).toBeChecked();
      await page.getByTestId("duel-diagnostics-open").click();
      await expect(page.getByTestId("duel-diagnostics-report")).toContainText(
        '"samples": []',
      );
      await page.getByTestId("confirm-operations-setting").click();
      await page.getByTestId("settings-close").click();
    }
    assert.deepEqual(errors, []);
    reports.push({
      profile,
      actions: 6,
      cancellation: true,
      activeCandidates: true,
      counterReset: true,
      languages: 4,
      errors,
    });
    console.log(
      `PASS ${profile}: active actions, cancellation, mandatory draft resets and four-language settings`,
    );
    await context.close();
  }
  writeFileSync(`${output}/report.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({
      path: `${output}/failure.png`,
      fullPage: true,
    });
    writeFileSync(`${output}/failure.html`, await currentPage.content());
  }
  throw error;
} finally {
  await browser?.close();
  await vite?.httpServer?.close();
}
