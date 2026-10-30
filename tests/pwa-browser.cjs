/** B08：真实 Service Worker、缓存和断网，发布版本/故障仅由隔离测试服务器注入。 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const checks = [], errors = [], requests = [];
let release = 'test-1', failedAsset = '', failNetwork = false, failWorker = false, workerSuffix = '', browser;
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    requests.push({ pathname, method: req.method });
    if (failNetwork || (failWorker && pathname.endsWith('/sw.js'))) { req.socket.destroy(); return; }
    if (pathname === '/probe.html') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>test gate</title>'); return; }
    // 只使 SW 预缓存失败；页面首屏模块仍能联网加载，才能验证在线降级与重试入口。
    if (failedAsset && pathname.endsWith(failedAsset) && req.headers['sec-fetch-dest'] === 'empty') { res.writeHead(503).end('test failure'); return; }
    const relative = pathname.replace(/^\/child-learning\//, '/');
    const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let data = await fs.readFile(file);
    if (relative === '/sw.js') data = Buffer.from(data.toString().replace(/const VERSION = '[^']+';/, `const VERSION = '${release}';`) + workerSuffix);
    if (relative === '/' || relative === '/index.html') data = Buffer.from(data.toString().replace('</head>', `<meta name="test-release" content="${release}"></head>`));
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const source = await fs.readFile(path.join(root, 'sw.js'), 'utf8');
  const assets = vm.runInNewContext(source + '\nASSETS;', { URL, self: { location: { href: base + '/sw.js' }, addEventListener() {} } });
  const paths = new Set(Array.from(assets, url => new URL(url).pathname.slice(1)));
  const jsFiles = [];
  const scan = async dir => {
    for (const item of await fs.readdir(path.join(root, dir), { withFileTypes: true })) {
      const name = dir + '/' + item.name;
      if (item.isDirectory()) await scan(name); else if (name.endsWith('.js')) jsFiles.push(name);
    }
  };
  await scan('src'); for (const name of jsFiles) assert.ok(paths.has(name), `遗漏离线模块 ${name}`);
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './#/home'); assert.equal(manifest.scope, './'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const data = await fs.readFile(path.join(root, icon.src));
    assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
  }
  checks.push(`PASS: 缓存清单覆盖全部 ${jsFiles.length} 个运行模块，共 ${paths.size} 个资源；manifest 相对路径、standalone、192/512px 图标尺寸正确`);

  browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const attach = async ctx => {
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); return page;
  };
  const ready = async page => {
    try {
      await page.waitForFunction(() => document.querySelector('#pwa-panel')?.dataset.ready === 'true' && !!navigator.serviceWorker.controller, null, { timeout: 10000 });
    } catch (error) {
      console.error('PWA readiness:', await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return { status: document.querySelector('#pwa-status')?.textContent, dataset: document.querySelector('#pwa-panel')?.dataset,
          active: reg?.active?.state, waiting: reg?.waiting?.state, installing: reg?.installing?.state,
          controller: navigator.serviceWorker.controller?.scriptURL, caches: await caches.keys() };
      }));
      throw error;
    }
  };
  const state = page => page.evaluate(() => ({ version: document.querySelector('#pwa-panel').dataset.version,
    release: document.querySelector('meta[name="test-release"]').content,
    profile: localStorage.getItem('km:active'), records: localStorage.getItem(`km:sessions:${JSON.parse(localStorage.getItem('km:active'))}`),
    session: localStorage.getItem(`km:quiz:active:${JSON.parse(localStorage.getItem('km:active'))}`) }));
  const seed = page => page.evaluate(async () => {
    const { generatePaper } = await import('./src/domain/generator.js');
    const { createSession, recordAttempt, finishSession, saveDraft } = await import('./src/app/quizSession.js');
    const paper = generatePaper({ kpIds: ['G1-01'], count: 5, types: ['horizontal'], seed: 12 });
    createSession(paper); recordAttempt(paper.questions[0].answer); finishSession('exit');
    createSession(generatePaper({ kpIds: ['G1-01'], count: 5, types: ['horizontal'], seed: 13 })); saveDraft('7');
  });
  let page = await attach(context);
  const activateWaiting = async () => {
    // 在作用域外等待旧客户端真正释放，避免 close 后立即新开又暂时命中旧活动版本。
    const gate = await attach(context); await gate.goto(base + '/probe.html');
    await page.close();
    await gate.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/child-learning/');
      return reg?.active?.state === 'activated' && !reg.waiting;
    });
    page = await attach(context); await page.goto(base + '/child-learning/#/home'); await ready(page);
    await gate.close();
  };
  await page.goto(base + '/child-learning/?preview=b08#/home'); await ready(page);
  assert.equal((await state(page)).version, 'test-1');
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), base + '/child-learning/sw.js');
  await seed(page); const beforeOffline = await state(page);
  failNetwork = true; await context.setOffline(true); const networkBefore = requests.length;
  await page.reload(); await ready(page);
  await page.getByRole('link', { name: '继续练习', exact: true }).click();
  await page.getByRole('button', { name: '继续练习', exact: true }).click();
  assert.equal(await page.locator('#quiz-answer').inputValue(), '7');
  const answer = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem(`km:quiz:active:${JSON.parse(localStorage.getItem('km:active'))}`));
    return s.paper.questions[0].answer;
  });
  await page.locator('#quiz-answer').fill(answer); await page.locator('#quiz-answer').press('Enter');
  await page.getByText('第 2 / 共 5 题', { exact: true }).waitFor();
  await page.getByRole('button', { name: '退出练习', exact: true }).click();
  await page.getByRole('button', { name: '确认结束', exact: true }).click();
  await page.locator('.result-page').waitFor();
  await page.getByRole('link', { name: '返回成绩历史', exact: true }).click();
  assert.equal(await page.locator('.history-record').count(), 2);
  await page.reload(); await ready(page); assert.equal(await page.locator('.history-record').count(), 2);
  await page.getByRole('link', { name: '出题练习', exact: true }).click();
  await page.locator('#generate-paper').click(); await page.getByRole('button', { name: '开始答题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor();
  assert.equal((await state(page)).profile, beforeOffline.profile);
  const offlineRequests = requests.slice(networkBefore).filter(request => !request.pathname.endsWith('/sw.js'));
  assert.deepEqual(offlineRequests, [], '网络已不可达，应用资源仍须完全从缓存提供；浏览器自身SW更新探测不属于应用资源');
  checks.push('PASS: /child-learning/ 子路径首访缓存后断网且服务器不可达，刷新→恢复草稿7→答题结算→查看/刷新2条历史→重新出题，应用资源无回源，档案保留');
  failNetwork = false; await context.setOffline(false);
  page.once('dialog', dialog => dialog.accept()); await page.goto(base + '/child-learning/#/home');
  await ready(page);

  // 更新时保留正在进行的练习与内存标记；第二个旧页面也必须阻止新版本提前接管。
  const other = await attach(context); await other.goto(base + '/child-learning/#/home'); await ready(other);
  const beforeUpdate = await state(page);
  await page.evaluate(() => { window.b08NoReload = 'preserved'; });
  await page.evaluate(async () => { await (await caches.open('unrelated-app')).put('/unrelated', new Response('keep')); });
  release = 'test-2';
  await page.locator('#pwa-check').click();
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
  await page.getByText(/新版已准备好/).waitFor();
  assert.equal(await page.evaluate(() => window.b08NoReload), 'preserved');
  assert.equal((await state(page)).version, 'test-1'); assert.equal((await state(page)).release, 'test-1');
  assert.equal((await state(page)).session, beforeUpdate.session);
  await page.reload(); await ready(page); assert.equal((await state(page)).release, 'test-1');
  await other.close(); await activateWaiting();
  assert.equal((await state(page)).version, 'test-2'); assert.equal((await state(page)).release, 'test-2');
  assert.equal((await state(page)).session, beforeUpdate.session); assert.equal((await state(page)).records, beforeUpdate.records);
  let keys = await page.evaluate(() => caches.keys());
  assert.ok(keys.includes('unrelated-app')); assert.ok(!keys.some(name => name.endsWith(':test-1')));
  checks.push('PASS: 新版完整预缓存后等待，旧双页面/刷新仍用旧版且不强制重载；全部关闭后新版接管，保留草稿/成绩/无关缓存，仅清理本站旧版本');

  // 完整安装失败，不能删除旧版缓存，也不能把部分资源当成准备就绪。
  release = 'test-3'; failedAsset = '/src/domain/generator.js';
  await page.locator('#pwa-check').click();
  await page.getByText(/新版准备失败/).waitFor();
  keys = await page.evaluate(() => caches.keys());
  assert.ok(keys.some(name => name.endsWith(':test-2'))); assert.ok(!keys.some(name => name.endsWith(':test-3')));
  assert.equal((await state(page)).version, 'test-2'); assert.equal((await state(page)).session, beforeUpdate.session);
  failNetwork = true; await context.setOffline(true); await page.reload(); await ready(page);
  assert.equal((await state(page)).release, 'test-2');
  failNetwork = false; await context.setOffline(false); failedAsset = '';
  await page.locator('#pwa-check').click();
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
  checks.push('PASS: 新版单个资源503时安装失败、候选缓存清理，旧版仍能断网刷新且学习数据不变；恢复资源后按钮重试可再次准备新版');

  // 同名版本的新脚本被拒绝覆盖，避免漏递增版本破坏旧页面。
  await activateWaiting();
  assert.equal((await state(page)).version, 'test-3');
  workerSuffix = '\n// test: 修改脚本但漏递增缓存版本\n';
  await page.locator('#pwa-check').click(); await page.getByText(/新版准备失败/).waitFor();
  assert.ok((await page.evaluate(() => caches.keys())).some(name => name.endsWith(':test-3')));
  assert.equal((await state(page)).records, beforeUpdate.records);
  workerSuffix = '';
  checks.push('PASS: 修改SW但漏递增VERSION时拒绝覆盖现有同名缓存，旧版缓存及历史保留');
  failWorker = true; await page.locator('#pwa-check').click();
  await page.getByText(/更新检查失败/).waitFor();
  assert.equal(await page.locator('#pwa-panel').getAttribute('data-ready'), 'true');
  assert.equal((await state(page)).records, beforeUpdate.records); failWorker = false;
  checks.push('PASS: sw.js 更新请求失败显示可重试提示；当前已缓存版本仍就绪，历史不变');

  // 安装说明不会在没有真实浏览器安装事件时声称安装成功。
  await page.locator('#pwa-install').click();
  assert.match(await page.locator('#pwa-detail').textContent(), /Safari|浏览器|安装请求/);
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const fit = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
      buttons: [...document.querySelectorAll('#pwa-panel button')].every(node => node.getBoundingClientRect().height >= 44) }));
    assert.equal(fit.overflow, false); assert.equal(fit.buttons, true);
  }
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pwa-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, '.tmp', 'b08-offline-status.png'), fullPage: false });
  checks.push('PASS: 安装按钮有浏览器菜单/Safari指引，不伪称安装成功；360/390/1440px白色布局无横溢出，按钮≥44px');

  // 根目录与子目录独立 scope；普通非清单请求不被离线缓存吞掉。
  const rootContext = await browser.newContext(); const rootPage = await attach(rootContext);
  await rootPage.goto(base + '/#/home'); await ready(rootPage);
  assert.equal(await rootPage.evaluate(() => navigator.serviceWorker.controller.scriptURL), base + '/sw.js');
  const childInRoot = await attach(rootContext);
  await childInRoot.goto(base + '/child-learning/#/home'); await ready(childInRoot);
  await childInRoot.waitForFunction(() => navigator.serviceWorker.controller.scriptURL.includes('/child-learning/sw.js'));
  const scopedCaches = await rootPage.evaluate(() => caches.keys());
  assert.ok(scopedCaches.includes('kidsmath-shell:/:test-3'));
  assert.ok(scopedCaches.includes('kidsmath-shell:/child-learning/:test-3'));
  assert.equal(await rootPage.evaluate(() => navigator.serviceWorker.controller.scriptURL), base + '/sw.js');
  await rootContext.setOffline(true); await rootPage.reload(); await ready(rootPage);
  await childInRoot.reload(); await ready(childInRoot);
  assert.ok((await state(rootPage)).profile); await rootContext.close();
  checks.push('PASS: 同源根目录与子目录各自注册/缓存，不误报其它作用域就绪、不删除对方缓存，两页均可断网刷新；未硬编码仓库名');

  const failedContext = await browser.newContext(); const failedPage = await attach(failedContext);
  failedAsset = '/src/domain/generator.js';
  await failedPage.goto(base + '/#/home'); await failedPage.getByText(/离线准备失败/).waitFor();
  assert.notEqual(await failedPage.locator('#pwa-panel').getAttribute('data-ready'), 'true');
  assert.deepEqual(await failedPage.evaluate(() => caches.keys()), []);
  failedAsset = ''; await failedPage.locator('#pwa-check').click(); await ready(failedPage);
  await failedContext.close();
  checks.push('PASS: 首次离线准备遇503，不误报就绪/不保留半缓存；联网重试后成功');

  const unsupportedContext = await browser.newContext();
  await unsupportedContext.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const unsupported = await attach(unsupportedContext); await unsupported.goto(base + '/#/practice');
  await unsupported.getByText(/暂不支持离线缓存/).waitFor();
  await unsupported.locator('#generate-paper').click(); await unsupported.getByRole('button', { name: '开始答题', exact: true }).waitFor();
  await unsupportedContext.close();
  checks.push('PASS: Service Worker API不支持时给出在线降级说明，仍可出题');

  // 已受控但缓存被清空的断网情形，与从未访问过的首次断网分开验证。
  await page.evaluate(async () => { for (const name of await caches.keys()) if (name.startsWith('kidsmath-shell:/child-learning/:')) await caches.delete(name); });
  failNetwork = true; await context.setOffline(true);
  await page.reload(); await page.getByRole('heading', { name: '暂时无法离线打开', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem(`km:sessions:${JSON.parse(localStorage.getItem('km:active'))}`)), beforeUpdate.records);
  failNetwork = false; await context.setOffline(false);
  await page.getByRole('link', { name: '重新打开', exact: true }).click(); await ready(page);
  assert.equal((await state(page)).records, beforeUpdate.records);
  checks.push('PASS: 已受控缓存被清空时离线提示真实且历史保留；恢复联网后自动重新准备完整缓存，无需清理学习数据');
  const fresh = await browser.newContext({ offline: true }); const freshPage = await attach(fresh);
  await assert.rejects(freshPage.goto(base + '/#/home'));
  assert.equal(fresh.serviceWorkers().length, 0); await fresh.close();
  checks.push('PASS: 从未缓存且首次断网只能由浏览器显示网络错误，不伪称可打开应用');

  assert.deepEqual(errors, []); checks.push('PASS: 上述应用页面无未捕获JavaScript异常，缓存请求均为GET，不上传学习数据');
  assert.ok(requests.every(request => request.method === 'GET'));
  await fs.writeFile(path.join(root, '.tmp', 'b08-browser-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), browser: await browser.version(), assets: paths.size, checks }, null, 2));
  console.log(checks.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); server.close();
});
