import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const reports = [], errors = [];
let browser, server;
const words = {
  zh: { locale: "zh-CN", selector: "界面语言", connect: "联机", search: "搜索录像标题", empty: "暂无数据" },
  en: { locale: "en-US", selector: "Interface language", connect: "Online", search: "Search replay titles", empty: "No data" },
  ja: { locale: "ja-JP", selector: "表示言語", connect: "接続", search: "リプレイ名を検索", empty: "データがありません" },
  ko: { locale: "ko-KR", selector: "표시 언어", connect: "온라인", search: "리플레이 제목 검색", empty: "데이터 없음" },
};
const copyrightTitles = { zh: "版权声明", en: "Copyright notice", ja: "著作権について", ko: "저작권 안내" };
try {
  server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  const origin = server.resolvedUrls.local[0];
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined) });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile });
    await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await context.addInitScript(() => { localStorage.setItem("language", "cn"); });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    let sockets = 0;
    page.on("websocket", () => sockets++);
    const resources = [];
    page.on("request", request => { if (request.url().includes("/environment/")) resources.push(request.url()); });
    for (const lang of ["zh", "en", "ja", "ko"]) {
      resources.length = 0;
      await page.goto(`${origin}?lang=${lang}#/`);
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
      await expect(page.locator("html")).toHaveAttribute("lang", words[lang].locale);
      assert.ok(resources.some(url => url.includes(`/${words[lang].locale}/cards.cdb`)), lang + " must load its card database before rendering");
      const copyright = page.locator('section[aria-labelledby="home-copyright"]');
      await copyright.scrollIntoViewIfNeeded();
      await expect(copyright.locator("h2")).toHaveText(copyrightTitles[lang]);
      await expect(copyright.locator("p")).toBeInViewport();
      await page.locator('nav a[href="#/replays"]').click();
      await expect(page.getByPlaceholder(words[lang].search)).toBeVisible();
      // The library deliberately starts empty; the UI note must follow the chosen language.
      const note = await page.locator(".replay-note").first().innerText();
      if (lang === "en" || lang === "ko") assert.ok(!/[\u4e00-\u9fff]/.test(note));
      await page.getByTestId("open-settings").click();
      const settings = page.locator(".ant-modal-content");
      await expect(settings.getByRole("tab").first()).toHaveText(lang === "zh" ? /音频/ : lang === "en" ? /Audio/ : lang === "ja" ? /オーディオ/ : /소리/);
      await page.getByTestId("settings-close").click();
      await page.locator('nav a[href="#/build"]').click();
      await expect(page.getByTestId("deck-name")).toBeVisible();
      if (mobile) await page.getByTestId("deck-tab-search").click();
      const search = page.getByTestId("deck-search-input");
      await search.fill("no-such-card-fixture-000"); await search.press("Enter");
      reports.push({ mobile, lang, resourcesAndPages: true });
    }
    // Hash language wins and survives payload scrubbing before lazy import.
    const ydk = Buffer.from("#main\n89631139\n#extra\n!side\n").toString("base64url");
    await page.goto(`${origin}?lang=en#/import?v=1&kind=deck&format=ydk-utf8-base64url&data=${ydk}&title=LanguageFixture&lang=ko`);
    await expect(page.getByTestId("deck-name")).toBeVisible({ timeout: 45000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "ko-KR");
    assert.equal(new URL(page.url()).hash, "#/build");
    const nameBefore = await page.getByTestId("deck-name").inputValue();
    // Explicitly changing language preserves the editor and updates an existing URL parameter.
    const selector = page.locator("nav .ant-select");
    await selector.click(); await page.locator('.ant-select-item-option[title="English"]').click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
    await expect(page.getByTestId("deck-name")).toHaveValue(nameBefore);
    assert.equal(new URL(page.url()).searchParams.get("lang"), "en");
    await page.reload(); await expect(page.getByTestId("deck-name")).toBeVisible({ timeout: 45000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
    await page.goto(`${origin}?lang=unknown#/match?room=FixtureRoom&spectate=1&autojoin=0&lang=ja`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja-JP");
    await expect(page.locator("#room-name")).toHaveValue("FixtureRoom");
    // Replay import also consumes hash parameters; initial card text/UI must still be Japanese.
    const replay = readFileSync("tests/fixtures/replay/native-deckout.yrp").toString("base64url");
    await page.goto(`${origin}?lang=ko#/replay-import?v=1&kind=replay&format=yrp-base64url&file=LanguageFixture.yrp&data=${replay}&lang=ja`);
    await expect(page.locator(".replay-board,.replay-field-board")).toBeVisible({ timeout: 60000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "ja-JP");
    await expect(page.getByRole("combobox", { name: "再生速度" })).toBeVisible();
    assert.equal(sockets, 0, "Language links, manual spectator form and imports must not create duel connections");
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ reports, hashPrecedenceAndImportScrubbing: true, manualSwitchRefreshAndDraftPreserved: true, onlineConnections: 0, realIosTested: false }));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
