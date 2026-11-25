// Smoke test: builds nothing itself. Start a server first (npm run dev, or npm run preview),
// then: npm run smoke [-- http://localhost:5173]
// Registers a demo player, visits the shops, plays, drives, and fails on any page error.
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'http://localhost:5173';
  const out = process.argv[3] || 'smoke-screenshots';
  require('fs').mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const step = async (name, fn) => {
    process.stdout.write(`- ${name} … `);
    await fn();
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log('ok');
  };
  try {
    await step('login', async () => {
      await page.goto(url);
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem('carcity.tablet', '0'); });
      await page.reload();
      await page.waitForSelector('.auth-card');
    });
    await step('register', async () => {
      await page.click('.switch-line button');
      await page.fill('.auth-form input >> nth=0', 'smoke' + (Date.now() % 100000));
      await page.fill('.auth-form input >> nth=1', 'secret1');
      await page.fill('.auth-form input >> nth=2', 'secret1');
      await page.click('.gender-btn.girl');
      await page.click('button[type=submit]');
      await page.waitForSelector('.btn-play', { timeout: 30000 });
      await page.waitForTimeout(2000);
    });
    await step('vehicle-shop', async () => {
      await page.click('.menu-actions .btn-tile >> nth=0');
      await page.waitForSelector('.shop-strip');
      await page.waitForTimeout(1500);
      await page.click('.back-btn');
      await page.waitForSelector('.btn-play');
    });
    await step('clothes-shop', async () => {
      await page.click('.menu-actions .btn-tile >> nth=1');
      await page.waitForSelector('.clothes-grid');
      await page.waitForTimeout(1500);
      await page.click('.back-btn');
      await page.waitForSelector('.btn-play');
    });
    await step('city', async () => {
      await page.click('.btn-play');
      await page.waitForSelector('.loading.done', { timeout: 120000 });
      await page.waitForTimeout(3000);
    });
    await step('drive', async () => {
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(4000);
      await page.keyboard.up('KeyW');
    });
    await step('walk', async () => {
      await page.keyboard.down('KeyS'); await page.waitForTimeout(2500); await page.keyboard.up('KeyS');
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(1500);
      await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
    });
    await step('back-to-menu', async () => {
      await page.click('.back-btn');
      await page.waitForSelector('.btn-play');
    });
  } catch (e) {
    errors.push('STEP FAILED: ' + e.message);
  }
  await browser.close();
  if (errors.length) {
    console.error('\nSMOKE TEST FAILED:\n' + errors.map((e) => '  ' + e).join('\n'));
    process.exit(1);
  }
  console.log(`\nSmoke test passed. Screenshots in ${out}/`);
})();
