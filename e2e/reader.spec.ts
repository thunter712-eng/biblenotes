import { expect, test, type Page } from '@playwright/test';

const verse = (page: Page, n: number) => page.locator(`.reader [data-v="${n}"]`).first();

test.beforeEach(async ({ page }) => {
  await page.goto('#/read/JHN/3');
  await expect(verse(page, 16)).toContainText('For God so loved the world');
});

test('selects a range, highlights it, and adds a typed note that survives reload', async ({ page }) => {
  await verse(page, 16).click();
  await verse(page, 17).click();
  const bar = page.getByTestId('action-bar');
  await expect(bar).toContainText('John 3:16-17');

  await bar.getByRole('button', { name: 'Highlight' }).click();
  await bar.getByRole('button', { name: 'yellow highlight' }).click();
  await expect(verse(page, 16).locator('.hl-c-yellow')).toBeVisible();
  await expect(verse(page, 17).locator('.hl-c-yellow')).toBeVisible();

  await verse(page, 16).click();
  await verse(page, 17).click();
  await bar.getByRole('button', { name: 'Typed note' }).click();
  const editor = page.locator('.inline-note .rich-text');
  await editor.click();
  await page.keyboard.type('God gave his Son');
  await page.waitForTimeout(600);

  await page.reload();
  await expect(verse(page, 16).locator('.hl-c-yellow')).toBeVisible();
  await expect(page.locator('.inline-note .rich-text')).toContainText('God gave his Son');
  await expect(page.locator('.inline-note')).toContainText('John 3:16-17');
});

test('a new typed note takes the cursor, so typing goes straight in', async ({ page }) => {
  await verse(page, 3).click();
  await page.getByRole('button', { name: 'Typed note' }).click();
  await expect(page.locator('.inline-note .rich-text')).toBeFocused();
  await page.keyboard.type('Born from above');
  await expect(page.locator('.inline-note .rich-text')).toContainText('Born from above');
});

test('collapses a note, and the verse marker reopens it', async ({ page }) => {
  await verse(page, 3).click();
  await page.getByRole('button', { name: 'Typed note' }).click();
  await expect(page.locator('.inline-note')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse note' }).click();
  await expect(page.locator('.inline-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show notes on verse 3' }).click();
  await expect(page.locator('.inline-note')).toBeVisible();
});

test('a highlight survives a translation switch', async ({ page }) => {
  await verse(page, 16).click();
  await page.getByRole('button', { name: 'Highlight' }).click();
  await page.getByRole('button', { name: 'green highlight' }).click();
  await page.getByLabel('Translation').selectOption('asv');
  await expect(verse(page, 16)).toContainText('only begotten');
  await expect(verse(page, 16).locator('.hl-c-green')).toBeVisible();
});

test('highlights a word range', async ({ page }) => {
  await verse(page, 16).click();
  await page.getByRole('button', { name: 'Words' }).click();
  const from = await page.locator('.is-wordmode [data-w="1"]').boundingBox();
  const to = await page.locator('.is-wordmode [data-w="3"]').boundingBox();
  await page.mouse.move(from!.x + 3, from!.y + 5);
  await page.mouse.down();
  await page.mouse.move(to!.x + 3, to!.y + 5, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.w-sel')).toHaveCount(3);
  await page.getByRole('button', { name: 'pink highlight' }).click();
  await expect(verse(page, 16).locator('.hl-c-pink')).toHaveCount(3);
  await expect(verse(page, 16).locator('.hl-c-pink').first()).toContainText('God');
});

test('selects by dragging across verses with a mouse', async ({ page }) => {
  const a = await verse(page, 3).boundingBox();
  const b = await verse(page, 5).boundingBox();
  await page.mouse.move(a!.x + 40, a!.y + 8);
  await page.mouse.down();
  await page.mouse.move(b!.x + 40, b!.y + 8, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('action-bar')).toContainText('John 3:3-5');
});

test('goes to a typed reference, including a one-chapter book', async ({ page }) => {
  await page.locator('.ref-btn').click();
  await page.getByLabel('Go to reference').fill('Ps 23:1-4');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ref-btn')).toHaveText('Psalm 23');
  await expect(verse(page, 1)).toContainText('shepherd');

  await page.locator('.ref-btn').click();
  await page.getByLabel('Go to reference').fill('Jude 5');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ref-btn')).toHaveText('Jude 1');
});

test('Psalm 119 keeps its Hebrew letter headings in place', async ({ page }) => {
  await page.goto('#/read/PSA/119');
  await expect(verse(page, 9)).toContainText('How can a young man');
  await expect(page.locator('.verse-label', { hasText: 'BETH' })).toHaveCount(1);
  await expect(verse(page, 8)).not.toContainText('BETH');
  const order = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.verse-label')].find((e) => e.textContent === 'BETH')!;
    return label.compareDocumentPosition(document.querySelector('.reader [data-v="9"]')!) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  expect(order).toBeTruthy();
});

test('verses can be selected from the keyboard', async ({ page }) => {
  await verse(page, 16).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('action-bar')).toContainText('John 3:16');
});

test('reopening the app returns to where reading stopped', async ({ page }) => {
  await verse(page, 30).scrollIntoViewIfNeeded();
  await page.getByTestId('reader').evaluate((el) => { el.scrollTop = 1400; });
  await page.waitForTimeout(800);
  const before = await page.getByTestId('reader').evaluate((el) => el.scrollTop);
  await page.goto('about:blank');
  await page.goto('');
  await expect(page.locator('.ref-btn')).toHaveText('John 3');
  await expect(verse(page, 1)).toBeAttached();
  await page.waitForTimeout(300);
  const after = await page.getByTestId('reader').evaluate((el) => el.scrollTop);
  expect(Math.abs(after - before)).toBeLessThan(420);
});

test('shows two translations verse by verse', async ({ page }) => {
  await page.getByRole('button', { name: 'Reading settings' }).click();
  await page.getByText('Show a second translation side by side').click();
  await page.keyboard.press('Escape');
  const row = page.locator('.parallel-row').filter({ hasText: 'only begotten' }).first();
  await expect(row).toContainText('only born Son');
});

test('finds verses by full-text search', async ({ page }) => {
  await page.goto('#/search?q=%22only%20born%20Son%22');
  await expect(page.getByTestId('search-count')).toContainText('verse', { timeout: 20_000 });
  await page.locator('.result', { hasText: 'John 3:16' }).click();
  await expect(page.locator('.ref-btn')).toHaveText('John 3');
});

test('a verse can be made a favorite, with the day it was chosen and why', async ({ page }) => {
  await page.goto('#/read/JHN/3');
  await page.locator('.reader [data-v="16"]').first().click();
  await page.getByRole('button', { name: 'Favorite' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add to favorites' });
  await expect(sheet).toContainText('For God so loved');
  await sheet.getByLabel('Date chosen').fill('2019-07-07');
  await sheet.getByLabel('When and why you chose it').fill('Read at my baptism');
  await sheet.getByRole('button', { name: 'Add to favorites' }).click();

  // A star marks the verse, and tapping it shows the note again.
  await page.getByRole('button', { name: /^Favorite: verse 16/ }).click();
  await expect(page.getByRole('dialog', { name: 'Favorite verse' }).getByLabel('When and why you chose it')).toHaveValue('Read at my baptism');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Favorite verses' }).click();
  await expect(page.locator('.fav-year-head')).toHaveText('2019');
  await expect(page.locator('.fav-entry')).toContainText('Read at my baptism');
  await page.getByRole('button', { name: 'Read John 3:16 in context' }).click();
  await expect(page.locator('.ref-btn')).toHaveText('John 3');
});

test('the ribbon bookmarks the chapter and lists bookmarks to jump to', async ({ page }) => {
  await page.goto('#/read/ROM/8');
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page.getByRole('button', { name: 'Bookmark Romans 8' }).click();
  await expect(page.locator('.ribbon-btn')).toHaveClass(/is-marked/);
  await page.goto('#/read/JHN/1');
  await page.getByRole('button', { name: 'Bookmarks' }).click();
  await page.getByRole('button', { name: 'Romans 8' }).click();
  await expect(page.locator('.ref-btn')).toHaveText('Romans 8');
});

test('holding the ribbon brings up the Sunday bingo card, which counts mentions and keeps stats', async ({ page }) => {
  await page.goto('#/read/JHN/3');
  const ribbon = page.locator('.ribbon-btn');
  const hold = async (loc: typeof ribbon, ms = 800) => {
    const box = (await loc.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
  };
  await hold(ribbon);
  const card = page.getByRole('dialog', { name: /^Bingo card for/ });
  await expect(card).toBeVisible();
  // A hold doesn't also open the bookmarks.
  await expect(page.getByRole('dialog', { name: 'Bookmarks' })).toHaveCount(0);

  await card.getByRole('button', { name: 'C.S. Lewis' }).click();
  await card.getByRole('button', { name: /^C\.S\. Lewis/ }).click();
  await expect(card.getByRole('button', { name: 'C.S. Lewis, 2 times' })).toBeVisible();
  await hold(card.getByRole('button', { name: /^C\.S\. Lewis/ }));
  await expect(card.getByRole('button', { name: 'C.S. Lewis, 1 time' })).toBeVisible();

  for (const name of ['Dr. Seuss', 'Wizard of Oz', 'Anything baseball']) await card.getByRole('button', { name, exact: true }).click();
  await expect(card.getByRole('status')).toHaveText('Bingo!');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/bingo.png' });

  await card.getByRole('button', { name: /^C\.S\. Lewis/ }).click();
  await card.getByRole('button', { name: 'Stats' }).click();
  await expect(card).toContainText('1 Sunday played, 1 bingo.');
  await expect(card.locator('.bingo-stat-list li').first()).toContainText('C.S. Lewis2× in 1 of 1');
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/bingo-stats.png' });

  // A tap on the ribbon puts it away.
  await ribbon.click();
  await expect(card).toHaveCount(0);
});
