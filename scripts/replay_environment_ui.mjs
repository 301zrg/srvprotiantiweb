// Replay rule environments in the browser (plan 02 §3.5, §3.7): automatic choice by
// replay time, hand-picked versions with a full reload, races while switching, the
// stale/unreadable list notice, a missing hand-picked version, four languages and
// phone/iPad portrait and landscape. Runs against a built site (default
// http://127.0.0.1:4173); SMOKE_URL may point at a sub-path or relative-base build.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const origin = (process.env.SMOKE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const index = JSON.parse(readFileSync("public/replay/revisions/index.json", "utf8"));
const [oldest, newest] = [index.environments[0].id, index.environments.at(-1).id];
const boundary = index.environments.at(-1).effectiveFromUnix;
const dir = resolve(".audit-tmp/replay-environment-ui");
mkdirSync(dir, { recursive: true });
const base = readFileSync("tests/fixtures/replay/native-deckout.yrp");
const variant = (name, timestamp) => {
  const b = Buffer.from(base);
  b.writeUInt32LE(timestamp, 20);
  writeFileSync(resolve(dir, name), b);
  return resolve(dir, name);
};
const files = {
  old: resolve("tests/fixtures/replay/native-deckout.yrp"),
  fresh: variant("env-after-boundary.yrp", boundary + 5),
  zero: variant("env-no-time.yrp", 0),
};
const play = { cn: "播放", en: "Play", ja: "再生", ko: "재생" };
const guess = {
  cn: "按本服时间表推测",
  en: "guessed from this server's timeline",
  ja: "当サーバーの履歴から推定",
  ko: "이 서버 기록으로 추정",
};
const label = { cn: "规则版本", en: "Rule version", ja: "ルールバージョン", ko: "규칙 버전" };

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const errors = [];
async function open(viewport, language, mobile = false) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.addInitScript((lang) => {
    localStorage.setItem("language", lang);
    localStorage.setItem("__neo_setting_config__", JSON.stringify({ replayAutoPlay: false }));
  }, language);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const deltas = [];
  page.on("request", (r) => {
    const m = r.url().match(/replay\/revisions\/([^/]+)\/delta\.data/);
    if (m) deltas.push(m[1]);
  });
  await page.goto(origin + "/#/replays", { waitUntil: "domcontentloaded" });
  await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
  await page.locator('input[type="file"]').setInputFiles([files.old, files.fresh, files.zero]);
  await expect(page.locator(".replay-entry")).toHaveCount(3, { timeout: 30000 });
  return { context, page, deltas };
}
const entry = (page, title) => page.locator(".replay-entry").filter({ hasText: title });
const start = async (page, title, language) => {
  await entry(page, title).getByRole("button", { name: play[language], exact: true }).click();
  await expect(page.getByTestId("replay-environment")).toBeVisible({ timeout: 30000 });
};
const loaded = (page) => expect(page.locator(".replay-progress")).toBeVisible({ timeout: 90000 });
const line = (page) => page.getByTestId("replay-environment");
const back = async (page) => {
  await page.goto(origin + "/#/replays");
  await expect(page.locator(".replay-entry")).toHaveCount(3, { timeout: 30000 });
};
const pick = async (page, id) => {
  await line(page).click();
  const list = page.getByTestId("replay-environment-list");
  await expect(list).toBeVisible();
  await list.locator(`[data-environment="${id}"]`).click();
};

try {
  // Four languages: automatic choice, the "guessed" wording for a local import, and
  // the newest environment for a replay without a start time.
  for (const language of ["cn", "en", "ja", "ko"]) {
    const { context, page, deltas } = await open({ width: 1280, height: 800 }, language);
    await start(page, "native-deckout", language);
    await expect(line(page)).toHaveAttribute("data-environment", oldest);
    await expect(line(page)).toHaveAttribute("data-basis", "auto");
    await expect(line(page)).toContainText(label[language]);
    await expect(line(page)).toContainText(guess[language]);
    await loaded(page);
    assert.ok(deltas.includes(oldest), `${language}: Worker loaded the ${oldest} delta`);
    await back(page);
    await start(page, "env-after-boundary", language);
    await expect(line(page)).toHaveAttribute("data-environment", newest);
    await loaded(page);
    await back(page);
    await start(page, "env-no-time", language);
    await expect(line(page)).toHaveAttribute("data-environment", newest);
    await expect(line(page)).toHaveAttribute("data-basis", "fallback");
    await loaded(page);
    await context.close();
  }

  // Hand-picked version: full reload, remembered, marked in the list, then back to automatic.
  {
    const { context, page, deltas } = await open({ width: 1280, height: 800 }, "cn");
    await start(page, "native-deckout", "cn");
    await loaded(page);
    deltas.length = 0;
    await pick(page, newest);
    await expect(line(page)).toHaveAttribute("data-environment", newest);
    await expect(line(page)).toHaveAttribute("data-basis", "manual");
    await loaded(page);
    assert.deepEqual(deltas, [newest], "a hand pick reloads with the chosen delta only");
    await back(page);
    await expect(entry(page, "native-deckout").getByTestId("replay-entry-environment")).toContainText(newest);
    await start(page, "native-deckout", "cn");
    await expect(line(page)).toHaveAttribute("data-basis", "manual");
    await loaded(page);
    await line(page).click();
    await page.getByTestId("replay-environment-list").locator('[data-environment="auto"]').click();
    await expect(line(page)).toHaveAttribute("data-basis", "auto");
    await expect(line(page)).toHaveAttribute("data-environment", oldest);
    await loaded(page);

    // Races: switch while still loading, A -> B -> A, then make sure the last pick wins.
    await back(page);
    await start(page, "native-deckout", "cn");
    await pick(page, newest);
    await expect(line(page)).toHaveAttribute("data-environment", newest);
    await pick(page, oldest);
    await expect(line(page)).toHaveAttribute("data-environment", oldest);
    await expect(line(page)).toHaveAttribute("data-basis", "manual");
    await loaded(page);
    await page.waitForTimeout(1500);
    await expect(line(page)).toHaveAttribute("data-environment", oldest);
    await expect(page.locator(".replay-error, .ant-alert-error")).toHaveCount(0);

    // A hand-picked version that no longer exists is an explicit error, never a silent switch.
    await page.evaluate(async () => {
      const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.includes("srvpro-replays"));
      const db = await new Promise((ok, no) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      const tx = db.transaction("entries", "readwrite");
      const all = await new Promise((ok) => { const r = tx.objectStore("entries").getAll(); r.onsuccess = () => ok(r.result); });
      const e = all.find((x) => x.title === "native-deckout");
      tx.objectStore("entries").put({ ...e, environmentOverride: "706-19990101" });
      await new Promise((ok) => (tx.oncomplete = ok));
      db.close();
    });
    await back(page);
    await entry(page, "native-deckout").getByRole("button", { name: "播放", exact: true }).click();
    await expect(page.getByText("手选的规则版本 706-19990101 已不存在")).toBeVisible({ timeout: 30000 });
    await expect(line(page)).toHaveCount(0);
    await context.close();
  }

  // The site's list changed since this tab loaded, or cannot be read (R4).
  for (const [mode, text] of [["stale", "网站已更新，请刷新页面后再播放"], ["missing", "暂时无法确认网站的规则版本表是否最新"]]) {
    const { context, page } = await open({ width: 1280, height: 800 }, "cn");
    await context.route(/replay\/revisions\/index\.json/, (route) =>
      mode === "stale"
        ? route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...index, environments: [...index.environments, { id: "706-29990101", effectiveFromUnix: 32503680000, profileSha256: "0".repeat(64) }] }) })
        : route.fulfill({ status: 404, body: "" }),
    );
    await start(page, "native-deckout", "cn");
    await expect(page.getByTestId("replay-environment-notice")).toContainText(text);
    await loaded(page); // the notice never blocks playback
    await context.close();
  }

  // Phones and iPads, portrait and landscape: the line is visible and the picker fits.
  for (const [name, viewport] of [
    ["phone-portrait", { width: 390, height: 844 }],
    ["phone-landscape", { width: 844, height: 390 }],
    ["ipad-portrait", { width: 820, height: 1180 }],
    ["ipad-landscape", { width: 1180, height: 820 }],
  ]) {
    const { context, page } = await open(viewport, "cn", true);
    await start(page, "native-deckout", "cn");
    await loaded(page);
    await expect(line(page)).toBeInViewport();
    await line(page).click();
    const list = page.getByTestId("replay-environment-list");
    await expect(list).toBeVisible();
    for (const b of await list.locator("button").all()) {
      const box = await b.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width + 1, `${name}: picker button fits horizontally`);
      const text = await b.innerText();
      assert.ok(!/&#x|&amp;|&lt;/.test(text), `${name}: no HTML entities in "${text}"`);
    }
    await expect(list.locator(`[data-environment="${newest}"]`)).toContainText("2026");
    // Let the modal finish its opening animation so the screenshot shows real contrast.
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(dir, `${name}-picker.png`) });
    await list.locator(`[data-environment="${newest}"]`).click();
    await expect(line(page)).toHaveAttribute("data-basis", "manual");
    await loaded(page);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`Replay environments: auto/guess/fallback in 4 languages, hand pick + reload + list mark + restore, races, missing pick error, stale/unreadable list notice, phone/iPad portrait+landscape (${origin})`);
} finally {
  await browser.close();
}
