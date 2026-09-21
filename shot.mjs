// Финальные скриншоты: падение (болтающиеся руки/ноги), посадка, куча. Юзер открывает PNG.
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
await page.goto('http://127.0.0.1:4173/?debug=1&autostart=1');
await page.waitForTimeout(400);
await page.evaluate(() => window.__HT_DEBUG__.forceSpawn('normal'));
await page.waitForTimeout(1100); // падает — руки/ноги видны и болтаются
await page.screenshot({ path: 'shot-falling.png' });
await page.waitForTimeout(2400); // приземлился и сеттлится
await page.screenshot({ path: 'shot-landed.png' });
await page.evaluate(() => window.__HT_DEBUG__.forceSpawn('fat'));
await page.waitForTimeout(900);
await page.screenshot({ path: 'shot-pile.png' });
await browser.close();
console.log('shots saved: shot-falling.png, shot-landed.png, shot-pile.png');
