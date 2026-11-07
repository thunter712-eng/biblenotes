import { expect, test, type Page } from '@playwright/test';
import { docSize, line, penStroke, selectTool, type InkHandle } from './helpers.ts';

declare global {
  interface Window { __ink: InkHandle }
}

const verse = (page: Page, n: number) => page.locator(`.reader [data-v="${n}"]`).first();

async function openNewPage(page: Page) {
  await page.getByRole('button', { name: 'Open notebook page' }).click();
  await page.getByRole('button', { name: /^New page for/ }).click();
  await expect(page.getByTestId('notebook-canvas')).toBeVisible();
  await page.waitForFunction(() => !!window.__ink);
}

test.beforeEach(async ({ page }) => {
  await page.goto('#/read/JHN/3');
  await expect(verse(page, 16)).toContainText('For God so loved');
});

test('the definition of done, start to finish', async ({ page }) => {
  // Select verses 16-17, highlight them and add a typed note.
  await verse(page, 16).click();
  await verse(page, 17).click();
  await page.getByRole('button', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'yellow highlight' }).click();
  await verse(page, 16).click();
  await verse(page, 17).click();
  await page.getByRole('button', { name: 'Typed note' }).click();
  await page.locator('.inline-note .rich-text').click();
  await page.keyboard.type('Love sends.');
  await page.waitForTimeout(500);

  // Open a lined notebook page beside the text.
  await openNewPage(page);
  await expect(page.locator('.page-title-btn')).toContainText('John 3');

  // Write with pressure, highlight the writing, erase, undo, and lasso-move, palm down throughout.
  await penStroke(page, line(80, 120, 300, 130, 16, (t) => 0.2 + t * 0.6));
  await penStroke(page, line(80, 170, 300, 180, 16));
  await selectTool(page, 'Highlighter');
  await penStroke(page, line(80, 120, 300, 130));
  expect(await docSize(page)).toBe(3);
  await selectTool(page, 'Stroke eraser');
  await penStroke(page, line(190, 160, 190, 190));
  expect(await docSize(page)).toBe(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await docSize(page)).toBe(3);
  await selectTool(page, 'Lasso select');
  await penStroke(page, [{ x: 40, y: 150 }, { x: 340, y: 150 }, { x: 340, y: 210 }, { x: 40, y: 210 }, { x: 40, y: 152 }]);
  expect(await page.evaluate(() => window.__ink.selectedIds.length)).toBe(1);
  await penStroke(page, line(190, 175, 190, 300));
  await page.getByRole('button', { name: 'Pen', exact: true }).click();

  // Everything comes back after a reload.
  await page.waitForTimeout(700);
  await page.reload();
  await expect(verse(page, 16).locator('.hl-c-yellow')).toBeVisible();
  await expect(page.locator('.inline-note .rich-text')).toContainText('Love sends.');
  await page.getByRole('button', { name: 'Open notebook page' }).click();
  await page.waitForFunction(() => !!window.__ink && window.__ink.document.size === 3);
});

test('strokes reach IndexedDB on their own, without a page switch', async ({ page }) => {
  await openNewPage(page);
  await penStroke(page, line(80, 120, 300, 130));
  await page.waitForTimeout(800);
  const rows = await page.evaluate(() => new Promise<number>((resolve) => {
    const req = indexedDB.open('bible-notes');
    req.onsuccess = () => {
      const c = req.result.transaction('pageObjects').objectStore('pageObjects').count();
      c.onsuccess = () => resolve(c.result);
    };
  }));
  expect(rows).toBe(1);
});

test('dragging a selected verse onto the page drops a quote', async ({ page }) => {
  await openNewPage(page);
  await verse(page, 16).click();
  // A verse wraps across lines, so aim for the first line it actually occupies.
  const from = await verse(page, 16).evaluate((el) => {
    const r = el.getClientRects()[0];
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const to = await page.getByTestId('notebook-canvas').boundingBox();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 30, { steps: 3 });
  await page.mouse.move(to!.x + 200, to!.y + 240, { steps: 6 });
  await expect(page.locator('.quote-ghost')).toContainText('John 3:16');
  await page.mouse.up();
  const quote = page.locator('.page-quote');
  await expect(quote).toContainText('For God so loved the world');
  await expect(quote).toContainText('John 3:16 (WEB)');
});

test('Add to page and Copy then Paste both make quotes', async ({ page }) => {
  await openNewPage(page);
  await verse(page, 1).click();
  await page.getByRole('button', { name: 'Add to page' }).click();
  await expect(page.locator('.page-quote')).toHaveCount(1);
  await verse(page, 2).click();
  await page.getByRole('button', { name: 'Copy' }).click();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect(page.locator('.page-quote')).toHaveCount(2);
  await expect(page.locator('.page-quote').nth(1)).toContainText('John 3:2');
});

test('a text box takes rich text, can change font, and persists', async ({ page }) => {
  await openNewPage(page);
  await selectTool(page, 'Text box');
  await penStroke(page, [{ x: 200, y: 200 }, { x: 200, y: 200 }]);
  const edit = page.locator('.page-box-edit .rich-text');
  await expect(edit).toBeVisible();
  await edit.click();
  await page.keyboard.type('Grace alone');
  await page.keyboard.press('Meta+A');
  const toolbar = page.locator('.page-ed-toolbar');
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Bold' }).click();
  await toolbar.getByLabel('Font', { exact: true }).selectOption('Caveat');
  await toolbar.getByRole('button', { name: 'Blue highlight' }).click();
  // Close the editor by tapping elsewhere on the page.
  await page.mouse.click(760, 700);
  const box = page.locator('.page-text');
  await expect(box).toContainText('Grace alone');
  await expect(box.locator('strong')).toBeVisible();
  await expect(box.locator('mark')).toBeVisible();
  await expect(box.locator('[style*="Caveat"]')).toBeVisible();
  await expect(page.locator('.page-text')).toHaveCount(1);

  await page.waitForTimeout(700);
  await page.reload();
  await page.getByRole('button', { name: 'Open notebook page' }).click();
  await expect(page.locator('.page-text strong')).toContainText('Grace alone');
});

test('undo removes a new text box and redo returns it', async ({ page }) => {
  await openNewPage(page);
  await selectTool(page, 'Text box');
  await penStroke(page, [{ x: 200, y: 200 }, { x: 200, y: 200 }]);
  await page.locator('.page-box-edit .rich-text').click();
  await page.keyboard.type('Temporary');
  await page.mouse.click(760, 700);
  await expect(page.locator('.page-text')).toContainText('Temporary');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.page-text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('.page-text')).toContainText('Temporary');
});

test('paper template and color can be changed', async ({ page }) => {
  await openNewPage(page);
  await page.getByRole('button', { name: 'Page settings' }).click();
  await page.getByRole('button', { name: 'Cornell notes' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ink-root')).toHaveAttribute('data-paper', 'dark');
  const blend = await page.evaluate(() => getComputedStyle(document.querySelector('.ink-hl')!).mixBlendMode);
  expect(blend).toBe('screen');
});

test('a narrow panel keeps a comfortable writing size and pans sideways', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openNewPage(page);
  const view = await page.evaluate(() => ({ ...window.__ink.view }));
  expect(view.scale).toBeGreaterThanOrEqual(0.72);
  await penStroke(page, line(40, 200, 300, 200));
  expect(await docSize(page)).toBe(1);
});

test('the divider resizes the split, and both full-screen modes work', async ({ page }) => {
  await openNewPage(page);
  const reader = page.locator('.split-reader');
  const before = (await reader.boundingBox())!.width;
  const d = (await page.locator('.divider').boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + 300);
  await page.mouse.down();
  await page.mouse.move(d.x - 150, d.y + 300, { steps: 5 });
  await page.mouse.up();
  expect((await reader.boundingBox())!.width).toBeLessThan(before - 100);

  await page.getByRole('button', { name: 'Full-screen notebook' }).click();
  await expect(reader).toHaveCount(0);
  await page.getByRole('button', { name: 'Show Scripture beside the page' }).click();
  await expect(reader).toBeVisible();
  await page.getByRole('button', { name: 'Close notebook' }).click();
  await page.getByRole('button', { name: 'Full-screen reading' }).click();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Leave full-screen reading' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
});

test('a handwritten note under a verse takes ink and keeps it', async ({ page }) => {
  await verse(page, 16).click();
  await page.getByRole('button', { name: 'Handwritten note' }).click();
  // The host appears before the note's page has loaded. The engine marks it once it's listening.
  await page.locator('[data-testid="inline-ink"].ink-root').waitFor();
  await penStroke(page, line(40, 60, 240, 80), 1, 'pen', '[data-testid="inline-ink"]');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId('inline-ink')).toBeVisible();
  const painted = await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="inline-ink"] .ink-ink');
    if (!c || !c.width) return false;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n > 100;
  });
  expect(painted).toBeTruthy();
});
