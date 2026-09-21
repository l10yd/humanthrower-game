/** E2E smoke (GDD §57, §A step 13): boot, menu → play, debug hooks, row clear, game over.
 * page.evaluate не сериализует функции — debug-хуки вызываются строго внутри evaluate. */
import { test, expect, type Page } from '@playwright/test';

interface DebugState {
  phase: string;
  score: number;
  best: number;
  bodies: number;
  humans: number;
}

const getState = (page: Page): Promise<DebugState> =>
  page.evaluate(() => (window as unknown as { __HT_DEBUG__: { getState(): DebugState } }).__HT_DEBUG__.getState());

const forceSpawn = (page: Page, archetype: string): Promise<void> =>
  page.evaluate((a) => (window as unknown as { __HT_DEBUG__: { forceSpawn(a?: string): void } }).__HT_DEBUG__.forceSpawn(a), archetype);

const forceRowComplete = (page: Page, row: number): Promise<void> =>
  page.evaluate((r) => (window as unknown as { __HT_DEBUG__: { forceRowComplete(r?: number): void } }).__HT_DEBUG__.forceRowComplete(r), row);

const killPlayer = (page: Page): Promise<void> =>
  page.evaluate(() => (window as unknown as { __HT_DEBUG__: { killPlayer(): void } }).__HT_DEBUG__.killPlayer());

const fly = (page: Page, on = true): Promise<void> =>
  page.evaluate((o) => (window as unknown as { __HT_DEBUG__: { fly(o?: boolean): void } }).__HT_DEBUG__.fly(o), on);

const hasHooks = (page: Page): Promise<boolean> =>
  page.evaluate(() => typeof (window as unknown as { __HT_DEBUG__?: { getState?: unknown } }).__HT_DEBUG__?.getState === 'function');

test.describe('Humanthrower smoke', () => {
  test('boots without page errors, menu → play → state machine', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/?debug=1&autostart=1');
    await expect(page.locator('.ht-hud')).toBeVisible();
    await expect(page.locator('.ht-canvas')).toBeVisible();

    expect(await hasHooks(page)).toBe(true);
    expect((await getState(page)).phase).toBe('playing');

    // pause / resume через клавишу P
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);
    expect((await getState(page)).phase).toBe('paused');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(200);
    expect((await getState(page)).phase).toBe('playing');

    expect(errors).toEqual([]);
  });

  test('forceSpawn adds bodies to the world', async ({ page }) => {
    await page.goto('/?debug=1&autostart=1');
    await page.waitForTimeout(400);
    const before = (await getState(page)).bodies;
    await forceSpawn(page, 'normal');
    await page.waitForTimeout(500);
    const after = (await getState(page)).bodies;
    // ragdoll = 7 тел
    expect(after).toBeGreaterThanOrEqual(before + 7);
  });

  test('forceRowComplete: row fills → transaction → score grows', async ({ page }) => {
    await page.goto('/?debug=1&autostart=1');
    await page.waitForTimeout(400);
    const s0 = await getState(page);
    // ряд 2 — НАД игроком (его торс в ряду 0). debug-полёт: grounded=false → очистка игрока не смывает
    await forceRowComplete(page, 2);
    await fly(page, true);
    // сеттлинг кусков + warning 0.45s + dangerous 0.7s + clear
    await page.waitForTimeout(4000);
    const s1 = await getState(page);
    expect(s1.score).toBeGreaterThan(s0.score + 100);
    expect(s1.phase).toBe('playing');
  });

  test('row clear sweeping grounded player → death (Смыло очисткой ряда)', async ({ page }) => {
    await page.goto('/?debug=1&autostart=1');
    await page.waitForTimeout(400);
    // ряд 0 — там стоит игрок: очистка ряда смывает его → проигрыш
    await forceRowComplete(page, 0);
    await page.waitForTimeout(2500);
    await expect(page.locator('.ht-screen.on')).toContainText('GAME OVER');
    await expect(page.locator('.ht-screen.on')).toContainText('Смыло');
  });

  test('killPlayer → game over screen → retry restarts', async ({ page }) => {
    await page.goto('/?debug=1&autostart=1');
    await page.waitForTimeout(400);
    await killPlayer(page);
    await expect(page.locator('.ht-screen.on')).toContainText('GAME OVER');
    await page.getByText('ЕЩЁ РАЗ').click();
    await page.waitForTimeout(300);
    const s = await getState(page);
    expect(s.phase).toBe('playing');
    // score сброшен; +12/с выживание за 0.3 с ожидания
    expect(s.score).toBeLessThan(15);
  });
});
