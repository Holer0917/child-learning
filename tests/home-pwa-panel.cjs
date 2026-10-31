const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webmanifest':'application/manifest+json', '.png':'image/png' };
const server = http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'text/plain'}).end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const results = [];
  try {
    for (const width of [390,1440]) {
      const context = await browser.newContext({viewport:{width,height:844}});
      const page = await context.newPage();
      const base = process.env.PWA_PANEL_SITE || `http://127.0.0.1:${server.address().port}/`;
      for (const route of ['home','practice','history','mistakes','profiles','settings','stats','result','quiz','unknown','home']) {
        await page.goto(base + '#/' + route);
        await page.locator('#app > *').first().waitFor();
        await page.waitForFunction(() => document.querySelector('#topbar .brand'));
        for (const id of ['pwa-panel','pwa-check','pwa-install']) assert.equal(await page.locator('#'+id).isVisible(),route === 'home',`${width}/${route}/${id}`);
        results.push({width,route,passed:true});
      }
      // Same-document navigation must show the controls again without a reload.
      await page.evaluate(() => {location.hash = '#/mistakes';});
      await page.locator('.start-page').waitFor({state:'detached'});
      assert.equal(await page.locator('#pwa-panel').isVisible(),false);
      await page.evaluate(() => {location.hash = '#/home';});
      await page.locator('.start-page').waitFor();
      assert.equal(await page.locator('#pwa-panel').isVisible(),true);
      await context.close();
    }
    await fs.mkdir(path.join(root,'.tmp'),{recursive:true});
    await fs.writeFile(path.join(root,'.tmp/home-pwa-panel-results.json'),JSON.stringify({passed:true,site:process.env.PWA_PANEL_SITE || 'local',results},null,2));
    console.log('PASS: 22 route/viewport checks and two same-document roundtrips');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;}).finally(()=>server.close());
