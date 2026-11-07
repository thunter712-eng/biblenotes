import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { line, penStroke, selectTool, type InkHandle } from './helpers.ts';

declare global {
  interface Window { __ink: InkHandle }
}

const verse = (page: Page, n: number) => page.locator(`.reader [data-v="${n}"]`).first();

// Desktop WebKit can claim to support file sharing and then refuse. Files should download in tests.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (navigator as unknown as { canShare?: unknown }).canShare = undefined; });
});

async function addTypedNote(page: Page, hash: string, v: number, text: string) {
  await page.goto(hash);
  await expect(verse(page, v)).toBeVisible();
  await verse(page, v).click();
  await page.getByRole('button', { name: 'Typed note' }).click();
  await page.locator('.inline-note .rich-text').last().click();
  await page.keyboard.type(text);
  await page.waitForTimeout(500);
}

async function pageWithInk(page: Page) {
  await page.goto('#/read/JHN/3');
  await page.getByRole('button', { name: 'Open notebook page' }).click();
  await page.getByRole('button', { name: /^New page for/ }).click();
  await page.waitForFunction(() => !!window.__ink);
  await penStroke(page, line(60, 120, 400, 120, 20));
  await selectTool(page, 'Highlighter');
  await penStroke(page, line(60, 220, 400, 220, 20));
  await selectTool(page, 'Pen');
  await page.waitForTimeout(600);
}

test('the notes index lists everything in Bible order, filters, and jumps to the note', async ({ page }) => {
  await addTypedNote(page, '#/read/ROM/8', 1, 'No condemnation');
  await addTypedNote(page, '#/read/GEN/1', 1, 'In the beginning');
  await page.getByRole('button', { name: 'Notes index' }).click();
  await expect(page.locator('.index-group h2').allTextContents()).resolves.toEqual(['Genesis', 'Romans']);

  await page.getByLabel('Search your notes').fill('condemnation');
  await expect(page.locator('.index-entry')).toHaveCount(1);
  await page.locator('.index-open').click();
  await expect(page.locator('.ref-btn')).toHaveText('Romans 8');
  await expect(page.locator('.inline-note .rich-text')).toContainText('No condemnation');
});

test('a collapsed note reopens when reached from the index', async ({ page }) => {
  await addTypedNote(page, '#/read/ROM/8', 1, 'Tucked away');
  await page.getByRole('button', { name: 'Collapse note' }).click();
  await expect(page.locator('.inline-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Notes index' }).click();
  await page.locator('.index-open').click();
  await expect(page.locator('.inline-note .rich-text')).toContainText('Tucked away');
});

test('tags can be added and filtered on', async ({ page }) => {
  await addTypedNote(page, '#/read/ROM/8', 1, 'Tagged');
  await addTypedNote(page, '#/read/GEN/1', 1, 'Untagged');
  await page.getByRole('button', { name: 'Notes index' }).click();
  await page.locator('.index-entry', { hasText: 'Tagged' }).filter({ hasText: 'Romans' }).getByRole('button', { name: 'Add tags' }).click();
  await page.getByLabel('Add a tag').fill('grace');
  await page.keyboard.press('Enter');
  await page.getByLabel('Filter by tag').selectOption('grace');
  await expect(page.locator('.index-entry')).toHaveCount(1);
  await expect(page.locator('.index-entry')).toContainText('Romans 8:1');
});

test('notebooks can be made, and pages renamed, moved, duplicated and deleted with undo', async ({ page }) => {
  await page.goto('#/notebooks');
  await expect(page.getByText('Notebooks group your pages')).toBeVisible();
  await page.getByLabel('New notebook name').fill('Romans study');
  await page.keyboard.press('Enter');
  await page.getByLabel('New notebook name').fill('Sermon notes');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'New page in Romans study' }).click();
  await expect(page.locator('.notebook-canvas')).toBeVisible();
  await page.goBack();

  await page.getByRole('button', { name: 'Settings for Untitled page' }).click();
  await page.getByLabel('Page title').fill('Chapter 8');
  await page.getByLabel('Page title').blur();
  await page.getByRole('combobox', { name: 'Notebook' }).selectOption({ label: 'Sermon notes' });
  await page.keyboard.press('Escape');
  await expect(page.locator('section', { hasText: 'Sermon notes' }).getByText('Chapter 8')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Chapter 8' }).click();
  await page.getByRole('button', { name: 'Duplicate page' }).click();
  await expect(page.getByText('Chapter 8 copy')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Chapter 8 copy' }).click();
  await page.getByRole('button', { name: 'Delete page' }).click();
  const copyRow = page.locator('.list-row', { hasText: 'Chapter 8 copy' });
  await expect(copyRow).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(copyRow).toBeVisible();
});

test('back up, wipe, and restore brings back notes and ink', async ({ page }, info) => {
  await addTypedNote(page, '#/read/JHN/3', 16, 'Back me up');
  await page.locator('.ref-btn').waitFor();
  await page.getByRole('button', { name: 'Open notebook page' }).click();
  await page.getByRole('button', { name: /^New page for/ }).click();
  await page.waitForFunction(() => !!window.__ink);
  await penStroke(page, line(60, 120, 400, 120, 20));
  await page.waitForTimeout(600);

  await page.goto('#/settings');
  await expect(page.getByTestId('last-backup')).toHaveText('Never backed up.');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up now' }).click()]);
  const path = info.outputPath('backup.zip');
  await download.saveAs(path);
  expect(download.suggestedFilename()).toMatch(/^bible-notes-backup-\d{4}-\d\d-\d\d\.zip$/);
  await expect(page.getByTestId('last-backup')).toContainText('today');

  await page.evaluate(() => new Promise<void>((resolve) => {
    const req = indexedDB.open('bible-notes');
    req.onsuccess = () => {
      const db = req.result;
      const names = ['notes', 'pages', 'pageObjects'];
      const tx = db.transaction(names, 'readwrite');
      names.forEach((n) => tx.objectStore(n).clear());
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload();
  await page.getByTestId('restore-input').setInputFiles(path);
  await expect(page.getByRole('dialog')).toContainText('1 notes, 1 pages');
  await page.getByRole('button', { name: 'Replace everything here' }).click();
  await expect(page.getByText('Restored 1 notes and 1 pages')).toBeVisible();

  await page.goto('#/read/JHN/3');
  await expect(page.locator('.inline-note .rich-text')).toContainText('Back me up');
  await page.getByRole('button', { name: 'Open notebook page' }).click();
  await page.waitForFunction(() => !!window.__ink && window.__ink.document.size === 1);
});

test('a damaged backup is refused with a clear message', async ({ page }) => {
  await page.goto('#/settings');
  await page.getByTestId('restore-input').setInputFiles({ name: 'x.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
  await expect(page.getByText('This file is not a Bible Notes backup')).toBeVisible();
});

test('PDF export is a real PDF', async ({ page }, info) => {
  await pageWithInk(page);
  await page.getByRole('button', { name: 'Page actions' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export as PDF' }).click()]);
  const path = info.outputPath('page.pdf');
  await download.saveAs(path);
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.toString('latin1')).toContain('/Count 1');
  expect(bytes.length).toBeGreaterThan(20_000);
});

test('PNG export shows ink, the blended highlighter and text', async ({ page }, info) => {
  await pageWithInk(page);
  await page.getByRole('button', { name: 'Page settings' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Page actions' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export as PNG' }).click()]);
  const path = info.outputPath('page.png');
  await download.saveAs(path);
  const b64 = readFileSync(path).toString('base64');
  const report = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0, yellow = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 70 && d[i + 1] < 70 && d[i + 2] < 90) dark++;
      if (d[i] > 220 && d[i + 1] > 200 && d[i + 2] < 190) yellow++;
    }
    return { w: c.width, h: c.height, dark, yellow };
  }, b64);
  expect(report.w).toBe(2040);
  expect(report.h).toBe(2640);
  expect(report.dark).toBeGreaterThan(1000);
  expect(report.yellow).toBeGreaterThan(5000);
});

test('the install advice shows on iPad Safari only, and stays dismissed', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
  });
  await page.goto('#/read/JHN/3');
  const tip = page.getByRole('region', { name: 'Install advice' });
  await expect(tip).toContainText('Add to Home Screen');
  await tip.getByRole('button', { name: 'Dismiss' }).click();
  await page.waitForTimeout(100);
  await page.reload();
  await expect(verse(page, 1)).toBeVisible();
  await expect(tip).toHaveCount(0);
});

test('the backup reminder appears once a backup is overdue', async ({ page }) => {
  await addTypedNote(page, '#/read/JHN/3', 1, 'Worth saving');
  await page.evaluate(() => new Promise<void>((resolve) => {
    const req = indexedDB.open('bible-notes');
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ key: 'lastBackupAt', value: Date.now() - 40 * 86_400_000 });
      tx.oncomplete = () => { req.result.close(); resolve(); };
    };
  }));
  await page.reload();
  await expect(page.getByText("It's been 40 days since your last backup")).toBeVisible();
});
