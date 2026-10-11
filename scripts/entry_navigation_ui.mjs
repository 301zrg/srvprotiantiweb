// Built-page regression; synthetic local storage only, with external requests blocked.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const sampleNames = [
  "HB",
  "TG Gadget",
  "Agents",
  "Dino Rabbit",
  "Asceticism Six Samurai",
  "Plant Synchro",
  "FTK Dark World",
  "Karakuri",
].map((name) => `1103-sample-${name}`);
function parseYdk(text) {
  const deck = { main: [], extra: [], side: [] };
  let zone = "main";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "#main") zone = "main";
    else if (line === "#extra") zone = "extra";
    else if (line === "!side") zone = "side";
    else if (/^\d+$/.test(line)) deck[zone].push(Number(line));
  }
  return deck;
}
const samples = sampleNames.map((deckName) => ({
  deckName,
  ...parseYdk(
    readFileSync(`neos-assets/structure-decks/${deckName}.ydk`, "utf8"),
  ),
}));
const languages = [
  {
    code: "zh",
    internal: "cn",
    label: "简体中文",
    home: "首页",
    connect: "进入联机",
    decks: "编辑卡组",
  },
  {
    code: "en",
    internal: "en",
    label: "English",
    home: "Home",
    connect: "Play online",
    decks: "Edit decks",
  },
  {
    code: "ja",
    internal: "ja",
    label: "日本語",
    home: "ホーム",
    connect: "オンライン対戦",
    decks: "デッキ編集",
  },
  {
    code: "ko",
    internal: "ko",
    label: "한국어",
    home: "홈",
    connect: "온라인 대전",
    decks: "덱 편집",
  },
];
const profiles = [
  { name: "desktop", width: 1280, height: 800, mobile: false },
  { name: "portrait", width: 390, height: 844, mobile: true },
  { name: "landscape", width: 844, height: 390, mobile: true },
  { name: "narrow", width: 320, height: 640, mobile: true },
];
const reports = [];
let server, browser, origin;
async function readDecks(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("decks");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            read = db.transaction("decks").objectStore("decks").getAll();
          read.onsuccess = () => {
            db.close();
            resolve(read.result);
          };
          read.onerror = () => {
            db.close();
            reject(read.error);
          };
        };
      }),
  );
}
async function ready(page) {
  await expect(page.locator('main[data-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
}
async function switchLanguage(page, language) {
  await page.locator("nav .ant-select").click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: language.label })
    .click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("language")))
    .toBe(language.internal);
  await expect(page.locator("nav .ant-select")).toContainText(language.label);
}
async function home(page, profile, language) {
  const link = profile.mobile
    ? page.getByTestId("mobile-home")
    : page.locator('nav a[href="#/"]');
  await expect(link).toBeVisible();
  if (profile.mobile) {
    await expect(link).toHaveAttribute("aria-label", language.home);
    await link.scrollIntoViewIfNeeded();
    const rect = await link.boundingBox();
    assert.ok(
      rect.width >= 44 &&
        rect.height >= 44 &&
        rect.x >= 0 &&
        rect.x + rect.width <= profile.width,
    );
  }
  await link.click();
  await expect(page.getByTestId("ladder-website")).toBeVisible();
  assert.equal(new URL(page.url()).hash, "#/");
}
async function checkLink(page, id, expected, click = false) {
  const link = page.getByTestId(id);
  await expect(link).toHaveAttribute("href", expected);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  if (click) {
    const popupPromise = page.waitForEvent("popup");
    await link.click();
    const popup = await popupPromise;
    await expect.poll(() => popup.url()).toBe(expected);
    await popup.close();
  }
}
async function contextFor(
  profile,
  websiteBaseUrl = "http://121.4.34.71:7922/",
) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
  });
  await context.route("**/*", (route) =>
    route.request().url().startsWith(origin)
      ? route.continue()
      : route.request().isNavigationRequest()
      ? route.fulfill({
          contentType: "text/html",
          body: "<title>Local navigation fixture</title>",
        })
      : route.abort(),
  );
  await context.route("**/duel-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.__SRVPRO_DUEL_CONFIG__=${JSON.stringify({
        duelWebSocketUrl: "",
        websiteBaseUrl,
      })};`,
    }),
  );
  return context;
}
try {
  server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  origin = server.resolvedUrls.local[0];
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
  });
  mkdirSync(".audit-tmp/entry-navigation", { recursive: true });
  for (const profile of profiles) {
    const context = await contextFor(profile);
    const page = await context.newPage(),
      errors = [];
    let sockets = 0;
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    page.on("websocket", () => sockets++);
    await page.goto(`${origin}?lang=zh#/`);
    await ready(page);
    const decks = await readDecks(page);
    assert.deepEqual(
      decks.map((deck) => deck.deckName).sort(),
      [...sampleNames].sort(),
    );
    for (const deck of samples)
      assert.deepEqual(
        decks.find((saved) => saved.deckName === deck.deckName),
        deck,
      );
    for (const language of languages) {
      if (language.code !== "zh") await switchLanguage(page, language);
      await checkLink(
        page,
        "ladder-website",
        `http://121.4.34.71:7922/?L=${language.code}`,
        profile.name === "portrait",
      );
      if (language.code === "zh") {
        await expect(page.getByTestId("website-features")).toHaveText(
          "你可以在这里看到当前全部决斗房间、查看天梯排名、搜索玩家对战记录、下载玩家对战录像及使用卡组、查看卡片及卡组使用率、查看主流卡组对战胜率",
        );
        await expect(page.getByTestId("website-client-advice")).toHaveText(
          "如果你想要连接更加稳定，推荐使用更为专业的ygopro客户端并安装天梯助手，你可以在上述官网中找到下载链接",
        );
      } else {
        await expect(page.getByTestId("website-features")).not.toContainText(
          "你可以",
        );
        await expect(
          page.getByTestId("website-client-advice"),
        ).not.toContainText("如果你");
      }
      await page
        .getByRole("button", { name: language.connect, exact: true })
        .click();
      await expect(page.locator("#room-name")).toBeVisible();
      await page.locator("#player-nickname").fill("EntryFixture$abc");
      await page.locator("#room-name").fill("M#Fixture$xyz");
      await checkLink(
        page,
        "room-list",
        `http://121.4.34.71:7922/rooms.html?L=${language.code}`,
        profile.name === "portrait",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      await page.getByTestId("connect-submit").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("connect-submit")).toBeInViewport();
      await home(page, profile, language);
      await page
        .getByRole("button", { name: language.connect, exact: true })
        .click();
      await expect(page.locator("#player-nickname")).toHaveValue(
        "EntryFixture$abc",
      );
      await expect(page.locator("#room-name")).toHaveValue("M#Fixture$xyz");
      await home(page, profile, language);
      await page
        .getByRole("button", { name: language.decks, exact: true })
        .click();
      await expect(page.getByTestId("deck-name")).toHaveValue(
        "1103-sample-Agents",
        { timeout: 30000 },
      );
      if (profile.mobile) await page.getByTestId("deck-tab-manage").click();
      for (const name of sampleNames) {
        const label = page
          .getByTestId("deck-manage-panel")
          .getByText(name, { exact: true });
        await expect(label).toHaveCount(1);
        assert.ok(
          await label.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
          `${name} must fit or wrap without truncation`,
        );
      }
      if (profile.mobile) {
        for (const tab of ["search", "deck", "manage"]) {
          await page.getByTestId(`deck-tab-${tab}`).click();
          await expect(page.getByTestId("mobile-home")).toBeVisible();
        }
      }
      if (language.code === "zh")
        await page.screenshot({
          path: `.audit-tmp/entry-navigation/${profile.name}-decks.png`,
        });
      await home(page, profile, language);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      reports.push({
        profile: profile.name,
        language: language.code,
        sampleDecks: 8,
        returnHome: true,
      });
    }
    assert.equal(sockets, 0);
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Upgrade a pre-existing library; a same-name user's edit must win.
  const profile = profiles[1],
    context = await contextFor(profile, "https://ladder.example.test/site/");
  await context.route("**/seed-entry", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Storage fixture</title>",
    }),
  );
  const page = await context.newPage();
  await page.goto(`${origin}seed-entry`);
  const existing = [
    {
      deckName: "My saved deck",
      main: [69247929, 69247929],
      extra: [],
      side: [43711255],
    },
    { deckName: "1103-sample-HB", main: [43711255], extra: [], side: [] },
    { deckName: "1103-sample", main: [69247929], extra: [], side: [] },
  ];
  await page.evaluate(
    (decks) =>
      new Promise((resolve, reject) => {
        localStorage.setItem("selectedDeckName", "My saved deck");
        const request = indexedDB.open("decks", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("decks");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("decks", "readwrite");
          for (const deck of decks)
            tx.objectStore("decks").put(deck, deck.deckName);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    existing,
  );
  await page.goto(`${origin}?lang=ja#/build`);
  await ready(page);
  await expect(page.getByTestId("deck-name")).toHaveValue("My saved deck");
  const upgraded = await readDecks(page);
  assert.equal(upgraded.length, 10);
  for (const deck of existing)
    assert.deepEqual(
      upgraded.find((saved) => saved.deckName === deck.deckName),
      deck,
    );
  await home(page, profile, languages[2]);
  await checkLink(
    page,
    "ladder-website",
    "https://ladder.example.test/site/?L=ja",
  );
  await page
    .getByRole("button", { name: languages[2].connect, exact: true })
    .click();
  await checkLink(
    page,
    "room-list",
    "https://ladder.example.test/site/rooms.html?L=ja",
  );
  // Switch while on the form; input and page state must stay intact.
  await page.locator("#player-nickname").fill("LanguageFixture");
  await switchLanguage(page, languages[3]);
  await checkLink(
    page,
    "room-list",
    "https://ladder.example.test/site/rooms.html?L=ko",
  );
  await expect(page.locator("#player-nickname")).toHaveValue("LanguageFixture");
  await home(page, profile, languages[3]);
  await page
    .getByRole("button", { name: languages[3].decks, exact: true })
    .click();
  await expect(page.getByTestId("deck-name")).toHaveValue("My saved deck");
  await page.getByTestId("deck-tab-manage").click();
  await page
    .getByRole("button", { name: "삭제 1103-sample-Agents", exact: true })
    .click();
  await expect(
    page
      .getByTestId("deck-manage-panel")
      .getByText("1103-sample-Agents", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await ready(page);
  const afterReload = await readDecks(page);
  assert.equal(afterReload.length, 9);
  assert.ok(
    !afterReload.some((deck) => deck.deckName === "1103-sample-Agents"),
  );
  for (const deck of existing)
    assert.deepEqual(
      afterReload.find((saved) => saved.deckName === deck.deckName),
      deck,
    );
  await context.close();
  // A storage denial still offers all eight samples in memory.
  const fallback = await contextFor(profile);
  await fallback.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      get() {
        throw new DOMException("Fixture denial", "SecurityError");
      },
    }),
  );
  const fallbackPage = await fallback.newPage();
  await fallbackPage.goto(`${origin}?lang=zh#/build`);
  await ready(fallbackPage);
  await expect(fallbackPage.getByTestId("deck-storage-warning")).toBeVisible();
  await fallbackPage.getByTestId("deck-tab-manage").click();
  for (const name of sampleNames)
    await expect(
      fallbackPage
        .getByTestId("deck-manage-panel")
        .getByText(name, { exact: true }),
    ).toHaveCount(1);
  await fallback.close();
  console.log(
    JSON.stringify({
      reports,
      migrationPreserved: true,
      deletedSamplesStayDeleted: true,
      storageFallback: true,
      configuredWebsitePreserved: true,
      sampleCardsAndOrderMatchFiles: true,
      realPhoneTested: false,
    }),
  );
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
