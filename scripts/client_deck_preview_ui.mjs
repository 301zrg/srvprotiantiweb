// The only hooks are added to this isolated test bundle; production exports stay unchanged.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const output = ".audit-tmp/client-deck-preview";
const client = `${output}/client`;
mkdirSync(output, { recursive: true });
const reports = [];
let server, browser;
try {
  if (!process.argv.includes("--built")) {
    await build({
      logLevel: "error",
      build: { outDir: client },
      plugins: [
        {
          name: "client-deck-preview-test-only",
          transform(code, id) {
            if (!id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return;
            return (
              code +
              `
            import { editDeckStore } from "@/ui/BuildDeck/store";
            import { setSelectedDeck } from "@/ui/BuildDeck";
            import { editingDeckToIDeck } from "@/ui/BuildDeck/utils";
            import { deckStore } from "@/stores/deckStore";
            import { forbidden, fetchCard } from "@/api";
            import { getPracticeDeck } from "@/practice/session";
            window.__clientDeckPreview = { editDeckStore, setSelectedDeck,
              editingDeckToIDeck, deckStore, forbidden, fetchCard, getPracticeDeck };
          `
            );
          },
        },
      ],
    });
    cpSync("neos-assets", `${client}/neos-assets`, {
      recursive: true,
      filter: (source) =>
        !/[\\/]deck-cases(?:[\\/]|$)|[\\/]sound[\\/]BGM(?:[\\/]|$)/.test(
          source,
        ),
    });
  }
  server = await preview({
    build: { outDir: client },
    preview: { host: "127.0.0.1", port: 0 },
  });
  const origin = server.resolvedUrls.local[0];
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
  });
  for (const [profile, viewport, mobile] of [
    ["desktop", { width: 1280, height: 800 }, false],
    ["portrait", { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
    });
    context.setDefaultTimeout(20000);
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: "window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:''};",
      }),
    );
    await context.addInitScript(() => localStorage.setItem("language", "cn"));
    const page = await context.newPage(),
      errors = [],
      runtimeRequests = [];
    let websockets = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", () => websockets++);
    page.on("request", (request) => {
      if (request.url().includes("/replay/706-v1/"))
        runtimeRequests.push(request.url());
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 60000,
    });
    const base = {
      deckName: "Client preview source",
      main: [89631139, 46986414, 26202165],
      extra: [44508094, 23995346],
      side: [],
    };
    await page.evaluate(async (base) => {
      const { deckStore, setSelectedDeck } = window.__clientDeckPreview;
      assertFixture(await deckStore.add(base));
      function assertFixture(added) {
        if (!added) throw new Error("Could not create owned test deck");
      }
      setSelectedDeck(base);
      location.hash = "/build";
    }, base);
    await expect(page.getByTestId("deck-name")).toHaveValue(base.deckName);
    const read = () =>
      page.evaluate(() => {
        const { editingDeckToIDeck, editDeckStore } =
          window.__clientDeckPreview;
        return editingDeckToIDeck(editDeckStore);
      });
    await expect.poll(async () => (await read()).main).toEqual(base.main);
    const tab = async (name) => {
      if (mobile) await page.getByTestId(`deck-tab-${name}`).click();
    };
    await tab("search");
    const categories = ["禁止", "限制", "准限制", "无限制"],
      categoryReports = [];
    async function filter(statuses) {
      await page.getByTestId("deck-filter-open").click();
      const dialog = page.locator(".ant-modal:visible");
      const select = dialog.getByTestId("deck-ban-status-filter");
      while (await select.locator(".ant-select-selection-item-remove").count())
        await select
          .locator(".ant-select-selection-item-remove")
          .first()
          .click();
      const input = select.getByRole("combobox");
      if ((await input.getAttribute("aria-expanded")) !== "true")
        await input.click();
      const options = page.locator(
        ".ant-select-dropdown:visible .ant-select-item-option",
      );
      await expect(
        options.locator(".ant-select-item-option-content"),
      ).toHaveText(categories);
      for (const status of statuses)
        await options
          .filter({ hasText: new RegExp(`^${categories[status]}$`) })
          .click();
      await dialog.getByText("卡片筛选", { exact: true }).click();
      await dialog.getByRole("button", { name: /^确\s*定$/ }).click();
      await expect(dialog).toBeHidden();
      await expect
        .poll(async () => {
          const actual = await page
            .getByTestId("deck-search-card")
            .evaluateAll((cards) =>
              cards.map((card) => {
                const { fetchCard, forbidden } = window.__clientDeckPreview;
                return (
                  forbidden.get(fetchCard(Number(card.dataset.cardCode))) ?? 3
                );
              }),
            );
          return (
            actual.length > 0 &&
            actual.every((status) => statuses.includes(status)) &&
            statuses.every((status) => actual.includes(status))
          );
        })
        .toBe(true);
      const actual = await page
        .getByTestId("deck-search-card")
        .evaluateAll((cards) =>
          cards.map((card) => {
            const { fetchCard, forbidden } = window.__clientDeckPreview;
            return {
              code: Number(card.dataset.cardCode),
              status:
                forbidden.get(fetchCard(Number(card.dataset.cardCode))) ?? 3,
            };
          }),
        );
      categoryReports.push({
        selected: statuses,
        shown: actual.length,
        counts: statuses.map(
          (status) => actual.filter((card) => card.status === status).length,
        ),
      });
    }
    for (const status of [0, 1, 2, 3]) await filter([status]);
    await filter([0, 2]);
    await page.screenshot({ path: `${output}/${profile}-filter.png` });
    await filter([0]);
    const forbiddenName = await page.evaluate(() => {
      const { fetchCard, forbidden } = window.__clientDeckPreview;
      const card = fetchCard(55144522);
      if (forbidden.get(card) !== 0 || !card.text.name)
        throw new Error("Owned fixture must use a real forbidden card");
      return card.text.name;
    });
    await page.getByTestId("deck-search-input").fill(forbiddenName);
    await page.getByTestId("deck-search-submit").click();
    const card = page.locator(
      '[data-testid="deck-search-card"][data-card-code="55144522"]',
    );
    await expect(card).toBeVisible();
    const addMain = card.getByRole("button", {
      name: `加入主卡组 ${forbiddenName}`,
      exact: true,
    });
    const addSide = card.getByRole("button", {
      name: `加入副卡组 ${forbiddenName}`,
      exact: true,
    });
    await addMain.click();
    assert.deepEqual(
      await read(),
      base,
      "Default banlist enforcement must reject forbidden cards",
    );
    await tab("deck");
    await page.getByTestId("deck-ignore-banlist").click();
    await expect(page.getByTestId("deck-ignore-banlist")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await tab("search");
    await addMain.click();
    await addMain.click();
    await addSide.click();
    const three = {
      ...base,
      main: [...base.main, 55144522, 55144522],
      side: [55144522],
    };
    await expect.poll(read).toEqual(three);
    await addMain.click();
    await addSide.click();
    assert.deepEqual(
      await read(),
      three,
      "Ignoring the banlist still caps combined main/side copies at three",
    );
    await tab("deck");
    await page.getByTestId("deck-ignore-banlist").click();
    await expect(page.getByTestId("deck-ignore-banlist")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    assert.deepEqual(
      await read(),
      three,
      "Re-enabling the banlist must retain the exact unsaved arrays",
    );
    await page.getByTestId("deck-name").fill("未保存的测试手牌卡组");
    const draft = { ...three, deckName: "未保存的测试手牌卡组" };
    await expect.poll(read).toEqual(draft);
    await page.getByTestId("deck-practice").click();
    await expect(page.getByTestId("practice-page")).toBeVisible();
    assert.deepEqual(
      await page.evaluate(() => window.__clientDeckPreview.getPracticeDeck()),
      draft,
    );
    await page
      .getByRole("button", { name: "返回卡组编辑", exact: true })
      .click();
    await expect(page.getByTestId("deck-name")).toHaveValue(draft.deckName);
    assert.deepEqual(
      await read(),
      draft,
      "Practice return must retain unsaved name, main/extra/side order and additions",
    );
    assert.equal(
      await page.evaluate(
        () => window.__clientDeckPreview.editDeckStore.edited,
      ),
      true,
    );
    assert.deepEqual(
      await page.evaluate(
        (name) => window.__clientDeckPreview.deckStore.get(name),
        base.deckName,
      ),
      base,
      "Testing a draft must not save over the source library deck",
    );
    await page.screenshot({ path: `${output}/${profile}-editor-return.png` });
    assert.equal(websockets, 0);
    assert.deepEqual(
      runtimeRequests,
      [],
      "Entering hand-test setup alone must not fetch the runtime",
    );
    assert.deepEqual(errors, []);
    reports.push({
      profile,
      categories: categoryReports,
      combinedThreeCopyCap: true,
      exactDraftRetained: true,
      sourceDeckUnchanged: true,
      websockets,
    });
    await context.close();
    console.log(
      `Client deck preview UI PASS ${profile}: four ban categories, multiselect, ignore-banlist three-copy cap, draft/order retained after practice`,
    );
  }
  writeFileSync(`${output}/report.json`, JSON.stringify(reports, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
