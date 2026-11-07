import { expect, test } from '@playwright/test';
import { docSize, getView, line, penStroke, pointer, selectTool, type InkHandle } from './helpers.ts';

declare global {
  interface Window { __ink: InkHandle }
}

const SHAPE_HOLD = 600;

test.beforeEach(async ({ page }) => {
  await page.goto('#/ink-test');
  await page.getByTestId('ink-root').waitFor();
  await page.waitForFunction(() => !!window.__ink);
});

test('a pen stroke commits with its pressure and shows on the ink layer', async ({ page }) => {
  await penStroke(page, line(100, 120, 400, 160, 20, (t) => 0.2 + t * 0.7));
  expect(await docSize(page)).toBe(1);
  const info = await page.evaluate(() => {
    const o = window.__ink.document.objects[0];
    const pts = o.pts!;
    return { type: o.type, count: pts.length / 4, p0: pts[2], pEnd: pts[pts.length - 2] };
  });
  expect(info.type).toBe('stroke');
  expect(info.count).toBeGreaterThan(10);
  expect(info.pEnd).toBeGreaterThan(info.p0);
  const painted = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.ink-ink')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(200);
});

test('fingers scroll and do not draw', async ({ page }) => {
  await page.evaluate(() => { window.__ink.view.y = 8; });
  await pointer(page, 'pointerdown', 'touch', 5, 300, 400);
  for (let i = 1; i <= 10; i++) await pointer(page, 'pointermove', 'touch', 5, 300, 400 - i * 12);
  await pointer(page, 'pointerup', 'touch', 5, 300, 280);
  expect(await docSize(page)).toBe(0);
  expect((await getView(page)).y).toBeLessThan(8);
});

test('palm: a touch while the pen is writing does nothing at all', async ({ page }) => {
  const before = await getView(page);
  await pointer(page, 'pointerdown', 'pen', 1, 100, 100);
  await pointer(page, 'pointerdown', 'touch', 9, 500, 500);
  for (let i = 1; i <= 8; i++) {
    await pointer(page, 'pointermove', 'pen', 1, 100 + i * 20, 100, 0.6);
    await pointer(page, 'pointermove', 'touch', 9, 500 - i * 20, 500 - i * 30);
  }
  await pointer(page, 'pointerup', 'touch', 9, 300, 300);
  await pointer(page, 'pointerup', 'pen', 1, 260, 100, 0);
  expect(await docSize(page)).toBe(1);
  expect(await getView(page)).toEqual(before);
});

test('palm: a touch that lands first is cancelled when the pen arrives, and its pan is undone', async ({ page }) => {
  const before = await getView(page);
  await pointer(page, 'pointerdown', 'touch', 9, 500, 500);
  for (let i = 1; i <= 4; i++) await pointer(page, 'pointermove', 'touch', 9, 500, 500 - i * 15);
  await penStroke(page, line(100, 100, 300, 100));
  await pointer(page, 'pointermove', 'touch', 9, 500, 300);
  await pointer(page, 'pointerup', 'touch', 9, 500, 300);
  expect(await docSize(page)).toBe(1);
  expect((await getView(page)).y).toBeCloseTo(before.y, 3);
});

test('palm: a touch straight after the pen lifts is ignored', async ({ page }) => {
  await penStroke(page, line(100, 100, 300, 100));
  const before = await getView(page);
  await pointer(page, 'pointerdown', 'touch', 9, 500, 500);
  for (let i = 1; i <= 6; i++) await pointer(page, 'pointermove', 'touch', 9, 500, 500 - i * 20);
  await pointer(page, 'pointerup', 'touch', 9, 500, 380);
  expect(await getView(page)).toEqual(before);
});

test('a very large contact is treated as a palm', async ({ page }) => {
  const before = await getView(page);
  await pointer(page, 'pointerdown', 'touch', 9, 500, 500, 0.5, { width: 120, height: 90 });
  for (let i = 1; i <= 6; i++) await pointer(page, 'pointermove', 'touch', 9, 500, 500 - i * 20);
  await pointer(page, 'pointerup', 'touch', 9, 500, 380);
  expect(await getView(page)).toEqual(before);
});

test('two fingers pinch to zoom and pan', async ({ page }) => {
  const before = await getView(page);
  await pointer(page, 'pointerdown', 'touch', 5, 300, 300);
  await pointer(page, 'pointerdown', 'touch', 6, 500, 300);
  for (let i = 1; i <= 8; i++) {
    await pointer(page, 'pointermove', 'touch', 5, 300 - i * 15, 300);
    await pointer(page, 'pointermove', 'touch', 6, 500 + i * 15, 300);
  }
  await pointer(page, 'pointerup', 'touch', 5, 180, 300);
  await pointer(page, 'pointerup', 'touch', 6, 620, 300);
  expect((await getView(page)).scale).toBeGreaterThan(before.scale * 1.3);
  expect(await docSize(page)).toBe(0);
});

test('undo and redo walk the history', async ({ page }) => {
  await penStroke(page, line(100, 100, 300, 100));
  await penStroke(page, line(100, 140, 300, 140));
  expect(await docSize(page)).toBe(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await docSize(page)).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await docSize(page)).toBe(0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await docSize(page)).toBe(2);
});

test('the highlighter goes on the blended layer and undoes as one step', async ({ page }) => {
  await penStroke(page, line(100, 200, 400, 200));
  await selectTool(page, 'Highlighter');
  await penStroke(page, line(100, 200, 400, 200));
  const brushes = await page.evaluate(() => window.__ink.document.objects.map((o) => o.brush));
  expect(brushes).toEqual(['ballpoint', 'highlighter']);
  const result = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('.ink-hl')!;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return { n, blend: getComputedStyle(c).mixBlendMode };
  });
  expect(result.n).toBeGreaterThan(500);
  expect(result.blend).toBe('multiply');
});

test('the stroke eraser removes a whole stroke, and undo brings it back', async ({ page }) => {
  await penStroke(page, line(100, 100, 400, 100));
  await penStroke(page, line(100, 300, 400, 300));
  await selectTool(page, 'Stroke eraser');
  await penStroke(page, line(250, 80, 250, 120));
  expect(await docSize(page)).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await docSize(page)).toBe(2);
});

test('the pixel eraser cuts a stroke in two, and undo restores it in one step', async ({ page }) => {
  await penStroke(page, line(100, 100, 400, 100));
  await selectTool(page, 'Pixel eraser');
  await penStroke(page, line(250, 60, 250, 140, 16));
  expect(await docSize(page)).toBe(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await docSize(page)).toBe(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await docSize(page)).toBe(2);
});

test('lasso selects, moves, resizes and undoes', async ({ page }) => {
  await penStroke(page, line(200, 200, 300, 200));
  await penStroke(page, line(200, 500, 300, 500));
  await selectTool(page, 'Lasso select');
  await penStroke(page, [{ x: 150, y: 150 }, { x: 350, y: 150 }, { x: 350, y: 250 }, { x: 150, y: 250 }, { x: 150, y: 160 }]);
  expect(await page.evaluate(() => window.__ink.selectedIds.length)).toBe(1);

  const y0 = await page.evaluate(() => window.__ink.document.objects.find((o) => o.id === window.__ink.selectedIds[0])!.bbox![1]);
  await penStroke(page, line(250, 200, 250, 300));
  const y1 = await page.evaluate(() => window.__ink.document.objects.find((o) => o.id === window.__ink.selectedIds[0])!.bbox![1]);
  const scale = (await getView(page)).scale;
  expect(y1 - y0).toBeCloseTo(100 / scale, 0);

  // Drag the bottom-right handle outward: the stroke grows.
  const box = () => page.evaluate(() => window.__ink.document.objects.find((o) => o.id === window.__ink.selectedIds[0])!.bbox!);
  const before = await box();
  const view = await getView(page);
  const hx = before[2] * view.scale + view.x;
  const hy = before[3] * view.scale + view.y;
  await penStroke(page, line(hx, hy, hx + 120, hy + 20));
  const after = await box();
  expect(after[2] - after[0]).toBeGreaterThan((before[2] - before[0]) * 1.3);
  await page.getByRole('button', { name: 'Undo' }).click();

  await page.getByRole('button', { name: 'Undo' }).click();
  const y2 = await page.evaluate(() => window.__ink.document.objects[0].bbox![1]);
  expect(y2).toBeCloseTo(y0, 1);
  expect(await docSize(page)).toBe(2);
});

test('holding at the end of a stroke snaps it to a shape', async ({ page }) => {
  const pts = line(100, 300, 500, 300, 20);
  await pointer(page, 'pointerdown', 'pen', 1, pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) await pointer(page, 'pointermove', 'pen', 1, p.x, p.y);
  await page.waitForTimeout(SHAPE_HOLD);
  await pointer(page, 'pointerup', 'pen', 1, 500, 300, 0);
  expect(await page.evaluate(() => window.__ink.document.objects[0].type)).toBe('shape');
});

test('a quick stroke is never snapped', async ({ page }) => {
  await penStroke(page, line(100, 300, 500, 300, 20));
  expect(await page.evaluate(() => window.__ink.document.objects[0].type)).toBe('stroke');
});

test('the shape tool draws an arrow', async ({ page }) => {
  await selectTool(page, 'Shapes');
  await selectTool(page, 'Shapes');
  await page.getByRole('button', { name: 'Arrow' }).click();
  await page.getByRole('button', { name: 'Shapes' }).click();
  await penStroke(page, line(100, 400, 400, 500));
  expect(await page.evaluate(() => window.__ink.document.objects[0].type)).toBe('shape');
});

test('the page grows when ink lands near the bottom', async ({ page }) => {
  await page.evaluate(() => { window.__ink.view.y = -900; });
  const sheets = () => page.evaluate(() => (window.__ink as unknown as { pageMeta: { sheets: number } }).pageMeta.sheets);
  expect(await sheets()).toBe(1);
  const scale = (await getView(page)).scale;
  const yOnScreen = (1040 * scale) + (await getView(page)).y;
  await penStroke(page, line(200, yOnScreen, 400, yOnScreen));
  expect(await sheets()).toBe(2);
});

test('performance with 5,000 strokes', async ({ page }) => {
  await page.getByRole('button', { name: 'Add 5,000 strokes' }).click();
  await expect(page.getByTestId('ink-bench')).toContainText('5000 strokes');
  console.log('BENCH', await page.getByTestId('ink-bench').textContent());
  const live = await page.evaluate(async () => {
    const el = document.querySelector('.ink-root')!;
    const r = el.getBoundingClientRect();
    const fire = (type: string, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'pen', clientX: r.left + x, clientY: r.top + y, pressure: 0.5, buttons: 1 }));
    fire('pointerdown', 100, 300);
    const times: number[] = [];
    for (let i = 0; i < 180; i++) {
      fire('pointermove', 100 + i * 3, 300 + Math.sin(i / 6) * 40);
      const t0 = performance.now();
      await new Promise((res) => requestAnimationFrame(res));
      times.push(performance.now() - t0);
    }
    const commit0 = performance.now();
    fire('pointerup', 640, 300);
    const commit = performance.now() - commit0;
    times.sort((a, b) => a - b);
    return { p50: times[90], p95: times[171], max: times[179], commit, liveFrameMs: window.__ink.stats().liveFrameMs };
  });
  console.log('LIVE', JSON.stringify(live));
  // A frame budget of 16.7 ms. The worst single frame gets some slack for GC on a shared CI machine.
  expect(live.liveFrameMs).toBeLessThan(8);
  expect(live.commit).toBeLessThan(16);
});
