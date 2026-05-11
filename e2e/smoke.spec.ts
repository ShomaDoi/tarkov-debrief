import { test, expect } from "@playwright/test";

const MAPS = [
  "customs",
  "interchange",
  "woods",
  "labs",
  "reserve",
  "shoreline",
  "factory",
  "lighthouse",
  "streets",
  "groundZero",
];

test("map selector lists every map", async ({ page }) => {
  await page.goto("/");
  for (const map of MAPS) {
    await expect(page.locator(`a[href="#/app/${map}"]`)).toBeVisible();
  }
});

for (const map of MAPS) {
  test(`opens ${map} and mounts a canvas`, async ({ page }) => {
    await page.goto(`/#/app/${map}`);
    await expect(page.locator("#canvas")).toBeAttached({ timeout: 10_000 });
  });
}

// Regression note: fabric v7 changed the default origin from top-left to
// center. The map background intentionally keeps the v7 default (center)
// because it gives a more useful initial view than anchoring the top-left
// corner. Markers, however, are pinned to originX:'left'/originY:'top'
// in stamp.ts so they land where the cursor's hotspot is (cursor SVG's
// top-left corner). If markers ever start appearing offset from the
// click point, suspect that pin was lost.
test("editor: draw a pencil stroke, place a marker, undo, save", async ({
  page,
}) => {
  await page.goto("/#/app/customs");
  const canvas = page.locator("#canvas");
  await expect(canvas).toBeAttached({ timeout: 10_000 });
  // The "upper-canvas" sibling is the one fabric routes events through.
  const interactive = page.locator(".upper-canvas");
  await expect(interactive).toBeVisible();

  // give fabric a moment to mount the background image before we interact
  await page.waitForTimeout(500);

  const box = await interactive.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");

  // pencil stroke
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200, { steps: 10 });
  await page.mouse.up();

  // Open the marker radial via the toolbar button, click a wedge,
  // place a marker. (Phase 5 replaced the sidebar marker grid
  // with this radial — design_p0_slice.md §7.)
  await page.locator('button img[alt="markers"]').click();
  // The radial wedges expose their marker label via aria-label.
  await page.getByRole("button", { name: "light PMC" }).click();
  // Radial dismisses on selection; click the canvas to place.
  await interactive.click({ position: { x: 250, y: 150 } });

  // undo button removes last marker
  await page.locator('button img[alt="undo"]').click();

  // save triggers a download
  const downloadPromise = page.waitForEvent("download");
  await page.locator('button img[alt="save"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("strategy.png");
});
