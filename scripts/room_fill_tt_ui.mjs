// The "TT" in the room hint fills the room name for the ladder queue (players
// typed M#TT or pasted a waiting room's name and opened a room instead).
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";

import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const folder = ".audit-tmp/room-fill-tt-ui";
mkdirSync(folder, { recursive: true });
let server, browser;
try {
  server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  const origin = server.resolvedUrls.local[0];
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
  });
  for (const [name, width, height, mobile] of [
    ["desktop", 1280, 800, false],
    ["portrait", 390, 844, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    let sockets = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", () => sockets++);
    for (const lang of ["zh", "en", "ja", "ko"]) {
      await page.goto(`${origin}?lang=${lang}#/match`);
      const room = page.locator("#room-name");
      await expect(room).toBeVisible({ timeout: 45000 });
      await room.fill("M#TT");
      const fill = page.getByTestId("room-fill-tt");
      await expect(fill).toHaveText("TT");
      assert.ok((await fill.getAttribute("aria-label"))?.includes("TT"));
      const box = await fill.boundingBox();
      assert.ok(box.height >= 20, `${name}/${lang}: tappable chip`);
      await fill.click();
      await expect(room).toHaveValue("TT");
      await expect(room).toBeFocused();
      if (lang === "zh")
        await page.screenshot({ path: `${folder}/${name}.png` });
      await page.reload();
      await expect(page.locator("#room-name")).toHaveValue("TT");
    }
    assert.equal(sockets, 0, "filling the room does not connect");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Room fill TT: four languages, desktop and phone, replaces M#TT, focuses, persists, no connection.",
  );
} finally {
  await browser?.close();
  await server?.httpServer?.close();
}
