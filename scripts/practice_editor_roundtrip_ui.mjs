import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const origin = process.env.SMOKE_URL || "http://127.0.0.1:4179";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("language", "cn");
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", ({ data }) => {
          if (data.type === "frame") window.__practiceEditorFrame = data.frame;
        });
      }
    };
  });
  const page = await context.newPage();
  const errors = [];
  let sockets = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("websocket", () => sockets++);
  await page.goto(origin);
  await expect(page.locator('main[data-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
  const fixture = {
    deckName: "Practice editor saved source",
    main: [89631139, 26202165, 46986414, 69247929, ...Array(36).fill(26202165)],
    extra: [],
    side: [5318639],
  };
  await page.evaluate(async (fixture) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open("decks");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result,
          tx = db.transaction("decks", "readwrite");
        tx.objectStore("decks").put(fixture, fixture.deckName);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    localStorage.setItem("selectedDeckName", fixture.deckName);
    sessionStorage.setItem("editingDeckName", fixture.deckName);
  }, fixture);
  await page.goto(origin + "/?practice-editor-roundtrip=1#/build");
  const name = page.getByTestId("deck-name"),
    main = page.getByTestId("deck-zone-main").getByTestId("deck-card");
  await expect(name).toHaveValue(fixture.deckName, { timeout: 60000 });
  await expect(main).toHaveCount(40);
  await name.fill("Unsaved practice draft");
  await main.first().click({ button: "right" });
  await expect(main).toHaveCount(39);
  await page.getByTestId("deck-ignore-banlist").click();
  await expect(page.getByTestId("deck-ignore-banlist")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const before = await main.evaluateAll((cards) =>
    cards.map((card) => Number(card.dataset.cardCode)),
  );
  await page.getByTestId("deck-practice").click();
  await expect(page.getByTestId("practice-page")).toBeVisible();
  await page.getByTestId("practice-setup").click();
  await expect(
    page.locator('.ant-select[aria-label="A 方卡组"]'),
  ).toContainText("Unsaved practice draft");
  await expect(
    page.locator('.ant-select[aria-label="B 方卡组"]'),
  ).toContainText("Unsaved practice draft");
  await page.getByTestId("practice-start").click();
  await expect(page.getByTestId("practice-board")).toBeVisible({
    timeout: 120000,
  });
  await page.waitForFunction(() => window.__practiceEditorFrame?.pending, { timeout: 120000 });
  const actual = await page.evaluate(() => window.__practiceEditorFrame);
  assert.equal(actual.cards.filter((c) => c.player === 0).length, 39);
  assert.equal(actual.cards.filter((c) => c.player === 1).length, 39);
  assert.ok(actual.names.every((n) => n.includes("Unsaved practice draft")));
  await page.getByRole("button", { name: "返回卡组编辑", exact: true }).click();
  await expect(name).toHaveValue("Unsaved practice draft");
  await expect(main).toHaveCount(39);
  assert.deepEqual(
    await main.evaluateAll((cards) =>
      cards.map((card) => Number(card.dataset.cardCode)),
    ),
    before,
  );
  await expect(page.getByTestId("deck-ignore-banlist")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("deck-save")).toHaveClass(/ant-btn-primary/);
  const saved = await page.evaluate(
    async (key) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("decks");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction("decks", "readonly"),
            get = tx.objectStore("decks").get(key);
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
          tx.oncomplete = () => db.close();
        };
      }),
    fixture.deckName,
  );
  assert.deepEqual(
    saved,
    fixture,
    "Entering practice never saves or overwrites the library deck",
  );
  assert.equal(sockets, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS editor -> actual Core practice -> editor preserves unsaved name, cards/order, ignore mode, dirty flag, and unchanged saved deck; zero WSS",
  );
  await context.close();
} finally {
  await browser.close();
}
