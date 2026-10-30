const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const root = path.join(__dirname, 'sandbox'), checks = [];
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    const body = await fs.readFile(file), types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end(); }
});
let browser, base;
async function run(id, kind, name, fn) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  try { await page.goto(base + '/#/home'); await page.getByRole('heading', { name: '开始', exact: true }).waitFor();
    const observed = await fn(page, errors); checks.push({ id, kind, name, reproduced: true, observed, pageErrors: errors });
  } catch (e) { checks.push({ id, kind, name, reproduced: false, error: e.message, pageErrors: errors }); }
  finally { await context.close(); }
  console.log(JSON.stringify({ id, kind, reproduced: checks.at(-1).reproduced, name }));
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  await run('C-B01', 'positive', '档案界面可创建/编辑/切换，第四个禁用', async page => {
    await page.goto(base + '/#/profiles'); await page.locator('#profile-name').fill('样例二');
    await page.getByRole('button', { name: '创建档案', exact: true }).click();
    await page.locator('#profile-name').fill('样例三'); await page.getByRole('button', { name: '创建档案', exact: true }).click();
    assert.equal(await page.locator('.profile-card').count(), 3);
    assert.equal(await page.getByRole('button', { name: '创建档案', exact: true }).isDisabled(), true);
    await page.locator('.profile-card').nth(1).getByRole('button', { name: '编辑', exact: true }).click();
    await page.locator('#profile-name').fill('已编辑'); await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.locator('.profile-card').nth(1).getByRole('button', { name: '切换', exact: true }).click();
    assert.ok((await page.locator('.profile-chip').textContent()).includes('已编辑'));
    return { profileCount: 3, fourthDisabled: true, headerUpdates: true };
  });
  await run('C-B02', 'integration', '覆盖main后学习统计入口失效，首页退回后续开放文案', async page => {
    const copy = await page.locator('.entry-mistakes').textContent(); assert.ok(copy.includes('后续支持')); assert.ok(copy.includes('下一步开放'));
    await page.goto(base + '/#/stats'); await page.getByText('页面不存在：/stats', { exact: true }).waitFor();
    return { homeMistakesCopy: copy, statsRoute: 'not-found' };
  });
  await run('C-B03', 'integration', '覆盖main后未注册PWA，新C模块未进入缓存清单', async page => {
    const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    assert.equal(registrations, 0);
    const worker = await fs.readFile(path.join(root, 'sw.js'), 'utf8');
    const assets = vm.runInNewContext(worker + '\nASSETS;', { URL, self: { location: { href: base + '/sw.js' }, addEventListener() {} } });
    const included = new Set(Array.from(assets, url => new URL(url).pathname.slice(1)));
    const missing = ['src/domain/backup.js', 'src/ui/pages/profiles.js', 'src/ui/pages/settings.js'].filter(name => !included.has(name));
    assert.equal(missing.length, 3);
    return { workerRegistrations: registrations, footerStatus: await page.locator('#pwa-status').textContent(), missingFromCache: missing };
  });
  await run('C-B04', 'defect', 'A错题备份在UI显示0并且导入被拒绝', async page => {
    const payload = await page.evaluate(async () => {
      const { generatePaper } = await import('/src/domain/generator.js');
      const { settleSession } = await import('/src/domain/grader.js');
      const { getActiveProfile } = await import('/src/domain/profile.js');
      const { write } = await import('/src/core/storage.js');
      const { archiveSession } = await import('/src/domain/mistakes.js');
      const { buildBackup } = await import('/src/domain/backup.js');
      const p = generatePaper({ kpIds: ['G2-01'], count: 5, types: ['horizontal'], seed: 2 });
      const record = { ...settleSession(p, Object.fromEntries(p.questions.map((q, i) => [q.id, { userAnswer: i ? q.answer : '-999', skipped: false }]))), id: 'browser-review', profileId: getActiveProfile().id };
      write('sessions:' + record.profileId, [record]); archiveSession(record); return buildBackup();
    });
    await page.goto(base + '/#/settings');
    await page.locator('input[type=file]').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    await page.locator('.import-preview').waitFor();
    const preview = await page.locator('.import-preview').textContent(); assert.ok(preview.includes('错题 0 条')); assert.ok(preview.includes('undefined'));
    await page.getByRole('button', { name: '确认导入', exact: true }).click(); await page.locator('.import-errors').waitFor();
    const error = await page.locator('.import-errors').textContent(); assert.ok(error.includes('mistakes 必须是数组'));
    return { preview, error };
  });
  await run('C-B05', 'defect', '合法JSON但非法profiles在校验前触发预览异常', async (page, errors) => {
    await page.goto(base + '/#/settings');
    await page.locator('input[type=file]').setInputFiles({ name: 'bad-structure.json', mimeType: 'application/json', buffer: Buffer.from('{"profiles":[null]}') });
    await page.waitForTimeout(200);
    assert.ok(errors.some(s => s.includes('null') && s.includes('id')));
    assert.equal(await page.locator('.import-errors').count(), 0);
    return { errors, validationMessageDisplayed: false };
  });
  await run('C-B06', 'defect', '档案按钮内部重绘导致键盘焦点丢到body', async page => {
    await page.goto(base + '/#/profiles');
    const button = page.getByRole('button', { name: '2 年级', exact: true }); await button.focus(); await page.keyboard.press('Enter');
    const active = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement === document.body ? '' : document.activeElement.textContent }));
    assert.equal(active.tag, 'BODY');
    return active;
  });
  await run('C-B07', 'measure', '手机/电脑页面布局与触控区实测', async page => {
    const measured = [];
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['home', 'profiles', 'settings', 'history', 'mistakes']) {
        await page.goto(base + '/#/' + route); await page.locator('#app h1').waitFor();
        measured.push(await page.evaluate(({ route, width }) => ({ route, width, scrollWidth: document.documentElement.scrollWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          smallButtons: [...document.querySelectorAll('#app button')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44); }).map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })) }), { route, width }));
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '/#/profiles');
    await page.screenshot({ path: path.join(__dirname, 'c-profiles-mobile.png'), fullPage: true });
    return { measured, overflowCases: measured.filter(x => x.overflow).length, undersizedButtonCases: measured.filter(x => x.smallButtons.length).length };
  });
  const result = { executedAt: new Date().toISOString(), basis: 'C ZIP overlay on current A+B; isolated headless Edge, not a real phone and not Gitee HEAD', checks,
    totals: { groups: checks.length, reproduced: checks.filter(x => x.reproduced).length } };
  await fs.writeFile(path.join(__dirname, 'browser-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.totals));
  if (checks.some(x => !x.reproduced)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
