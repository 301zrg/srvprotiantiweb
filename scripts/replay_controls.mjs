// Replay controls live in the duel toolbar: a full sidebar shows every
// button, compact layouts (portrait, short landscape) keep the common ones and
// move the rest into a "more" panel. These helpers reach a control in either
// layout.
import { expect } from "@playwright/test";

const moreItem = (page, name) =>
  page
    .getByTestId("replay-more-panel")
    .getByRole("button", { name, exact: true });

// Short landscape expands the log over the controls; collapse it first.
async function showControls(page) {
  const expand = page.getByTestId("duel-expand-logs");
  if (
    (await expand.count()) &&
    (await expand.getAttribute("aria-expanded")) === "true"
  )
    await expand.click();
}

export async function replayControl(page, name) {
  await showControls(page);
  const button = page.getByRole("button", { name, exact: true });
  if (await button.isVisible()) return button.click();
  await page.getByTestId("replay-more").click();
  await moreItem(page, name).click();
  // The panel closes on selection; let it finish before the next control.
  await expect(page.getByTestId("replay-more-panel")).toBeHidden();
  await page.waitForTimeout(300);
}

/** Asserts a control (e.g. "音效：开") is offered, then closes "more". */
export async function expectReplayControl(page, name) {
  await showControls(page);
  const button = page.getByRole("button", { name, exact: true });
  if (await button.isVisible()) return;
  await page.getByTestId("replay-more").click();
  await expect(moreItem(page, name)).toBeVisible();
  await page.getByTestId("replay-more-panel-close").click();
  await expect(page.getByTestId("replay-more-panel")).toBeHidden();
  // Let the closing panel return focus before the next interaction.
  await page.waitForTimeout(300);
}

/** aria-pressed of a toggle (sound, reveal), wherever it is shown. */
export async function replayControlPressed(page, name) {
  await showControls(page);
  const button = page.getByRole("button", { name, exact: true });
  if (await button.isVisible()) return button.getAttribute("aria-pressed");
  await page.getByTestId("replay-more").click();
  const pressed = await moreItem(page, name).getAttribute("aria-pressed");
  await page.getByTestId("replay-more-panel-close").click();
  await expect(page.getByTestId("replay-more-panel")).toBeHidden();
  await page.waitForTimeout(300);
  return pressed;
}

export async function replayJump(page, turn, labels = {}) {
  const input = labels.input ?? "目标回合";
  const jump = labels.jump ?? "跳到回合";
  const go = labels.go ?? "跳转";
  await showControls(page);
  const inline = page.getByLabel(input, { exact: true });
  if (await inline.first().isVisible()) {
    await inline.first().fill(String(turn));
    return page.getByRole("button", { name: jump, exact: true }).click();
  }
  await page.getByTestId("replay-more").click();
  await moreItem(page, jump).click();
  const dialog = page.locator(".ant-modal:visible");
  await dialog.getByLabel(input, { exact: true }).fill(String(turn));
  await dialog.getByRole("button", { name: go, exact: true }).click();
}
