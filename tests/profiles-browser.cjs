const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..'), checks = [], errors = [];
let browser, base;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), release = url.pathname.startsWith('/release/');
    const pathname = decodeURIComponent(release ? url.pathname.slice(8) : url.pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    let body = await fs.readFile(file);
    if (file.endsWith('.html') && !release) body = Buffer.from(body.toString().replace('</head>', '<meta name="kidsmath-development" content="true"></head>'));
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end(); }
});
const pass = text => { checks.push('PASS: ' + text); console.log(checks.at(-1)); };
async function open(release = false, unavailable = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  if (unavailable) await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); }; });
  page.on('pageerror', e => errors.push(e.message));
  const url = base + (release ? '/release/' : '/');
  await page.goto(url + '#/home'); await page.getByRole('heading', { name: '开始', exact: true }).waitFor();
  return { context, page, url };
}
async function fixture(page, url) {
  return page.evaluate(async url => {
    const mod = name => import(new URL('src/' + name, url));
    const p = (await mod('domain/profile.js')).getActiveProfile();
    const { generatePaper } = await mod('domain/generator.js'), { settleSession, judgeAnswer } = await mod('domain/grader.js');
    const { write } = await mod('core/storage.js'), { archiveSession } = await mod('domain/mistakes.js');
    const records = Array.from({ length: 3 }, (_, i) => {
      const kp = i === 2 ? 'G1-01' : 'G2-01', paper = generatePaper({ kpIds: [kp], count: 5, types: ['horizontal'], seed: i + 6 });
      const attempts = Object.fromEntries(paper.questions.map((q, n) => { const answer = n ? q.answer : '-999'; return [q.id, { userAnswer: answer, ...judgeAnswer(q, answer), elapsedMs: 500 }]; }));
      return { ...settleSession(paper, attempts, 2500), id: 'fixture-' + i, profileId: p.id, finishedAt: new Date(2026, 9, 28 - i, 12).getTime() };
    });
    write('sessions:' + p.id, records); records.forEach(archiveSession);
    write('settings', { sound: true, theme: 'auto' });
    write('badges:' + p.id, { version: 1, items: [{ id: 'd7', earnedAt: '2026-10-01' }] });
    return { pid: p.id, records: records.length, mistakes: (await mod('domain/mistakes.js')).readStore(p.id).items.length };
  }, url);
}
async function file(page, payload, name = 'valid.json') {
  await page.locator('#backup-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)) });
  await page.getByText('已选择：' + name, { exact: true }).waitFor();
}
const exported = (page, url) => page.evaluate(async url => (await import(new URL('src/domain/backup.js', url))).buildBackup(), url);
(async () => {
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  {
    const { context, page, url } = await open();
    assert.equal(await page.locator('.start-entry').count(), 3);
    assert.ok(!(await page.locator('.entry-mistakes').textContent()).includes('后续'));
    await page.getByRole('link', { name: '档案', exact: true }).click(); await page.locator('.profiles-page').waitFor();
    assert.equal(await page.locator('#profile-name').count(), 0);
    await page.getByRole('button', { name: '创建档案', exact: true }).click();
    assert.equal(await page.locator('.profiles-list-card').isVisible(), false);
    await page.getByRole('button', { name: '返回档案列表', exact: true }).click();
    assert.equal(await page.locator('#app h1').evaluate(n => n === document.activeElement), true);
    assert.equal(await page.locator('.profile-card').count(), 1);
    await page.getByRole('button', { name: '创建档案', exact: true }).click();
    await page.getByRole('button', { name: '创建档案', exact: true }).click();
    await page.getByRole('button', { name: '创建档案', exact: true }).click();
    await page.locator('#profile-name').fill('样例三'); await page.getByRole('button', { name: '创建档案', exact: true }).click();
    assert.equal(await page.locator('.profile-card').count(), 3); assert.equal(await page.getByRole('button', { name: '创建档案', exact: true }).isDisabled(), true);
    await page.locator('.profile-card').nth(1).getByRole('button', { name: '编辑', exact: true }).click();
    await page.locator('#profile-name').fill('修改昵称');
    await page.locator('#profile-grade-2').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'profile-grade-2');
    await page.locator('#profile-avatar-2').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'profile-avatar-2');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    await page.locator('.profile-card').nth(1).getByRole('button', { name: '切换', exact: true }).click();
    assert.ok((await page.locator('.profile-chip').textContent()).includes('修改昵称')); assert.ok((await page.locator('.profile-chip').textContent()).includes('🐯'));
    await page.goto(url + '#/stats'); await page.locator('.stats-page').waitFor();
    pass('保留首页三入口和统计，档案创建/上限/编辑/切换/头像及键盘焦点通过'); await context.close();
  }
  {
    const { context, page, url } = await open();
    const original = await page.evaluate(async () => {
      const { generatePaper } = await import('/src/domain/generator.js'), q = await import('/src/app/quizSession.js');
      const p = await import('/src/domain/profile.js'); const old = p.getActiveProfile(); p.createProfile({ name: '二', grade: 2 });
      q.createSession(generatePaper({ kpIds: ['G1-01'], count: 5, types: ['horizontal'], seed: 2 })); q.saveDraft('12'); return old.id;
    });
    await page.goto(url + '#/profiles'); page.once('dialog', d => d.dismiss());
    await page.locator('.profile-card').nth(1).getByRole('button', { name: '切换', exact: true }).click();
    assert.equal(await page.evaluate(async () => (await import('/src/domain/profile.js')).getActiveProfile().id), original);
    page.once('dialog', d => d.accept()); await page.locator('.profile-card').nth(1).getByRole('button', { name: '切换', exact: true }).click();
    await page.goto(url + '#/history'); await page.getByText('第一份成绩，等你来创造', { exact: true }).waitFor();
    await page.goto(url + '#/profiles'); await page.locator('.profile-card').first().getByRole('button', { name: '切换', exact: true }).click();
    assert.equal(await page.evaluate(async () => (await import('/src/app/quizSession.js')).resumeSession().draft), '12');
    pass('有未完成练习时切换需确认，取消保留原档案，切回可恢复原草稿'); await context.close();
  }
  {
    const { context, page, url } = await open(); await fixture(page, url);
    await page.goto(url + '#/profiles'); page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: '删除', exact: true }).click();
    assert.equal(await page.locator('.profile-card').count(), 1);
    page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.getByText('还没有学习档案', { exact: true }).waitFor(); await page.reload(); await page.getByText('还没有学习档案', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => /km:(sessions|mistakes|badges|quiz:active|quiz:result):/.test(k)).length), 0);
    await page.goto(url + '#/practice'); await page.getByRole('heading', { name: '先创建学习档案', exact: true }).waitFor();
    await page.getByRole('link', { name: '创建学习档案', exact: true }).click(); await page.getByRole('button', { name: '创建档案', exact: true }).click(); await page.getByRole('button', { name: '创建档案', exact: true }).click();
    assert.equal(await page.locator('.profile-card').count(), 1);
    pass('删除确认可取消，最后档案清理后刷新不自动重建，并引导新建'); await context.close();
  }
  {
    const { context, page, url } = await open(), seeded = await fixture(page, url);
    await page.goto(url + '#/history'); assert.equal(await page.locator('.history-record').count(), 3);
    await page.locator('#history-from').fill('2026-10-28'); await page.locator('#history-from').blur();
    await page.locator('#history-to').fill('2026-10-28'); await page.locator('#history-to').blur();
    assert.equal(await page.locator('.history-record').count(), 1);
    assert.equal(await page.locator('#history-to').inputValue(), '2026-10-28');
    await page.locator('#history-kp').selectOption('G1-01'); await page.getByText('没有符合条件的记录', { exact: true }).waitFor();
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    await page.locator('.record-delete').first().focus(); page.once('dialog', d => d.accept()); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.history-record').count(), 2);
    assert.equal(await page.evaluate(async pid => (await import('/src/domain/mistakes.js')).readStore(pid).items.length, seeded.pid), seeded.mistakes);
    await page.goto(url + '#/result?id=fixture-0'); await page.getByText('找不到这条练习记录', { exact: true }).waitFor();
    pass('历史日期/知识点筛选、清除、键盘删除和已删除详情空态通过，错题独立保留'); await context.close();
  }
  {
    const { context, page, url } = await open(); const seeded = await fixture(page, url);
    await page.goto(url + '#/settings');
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份', exact: true }).click();
    const download = await event; assert.match(download.suggestedFilename(), /^kidsmath-backup-\d{8}\.json$/);
    const payload = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(payload.settings.sound, true); assert.equal(payload.data[seeded.pid].mistakes.length, seeded.mistakes);
    await page.evaluate(async () => { const p = await import('/src/domain/profile.js'); p.createProfile({ name: '额外档案', grade: 2 }); });
    await file(page, payload); await page.locator('#import-mode').selectOption('overwrite');
    assert.ok(!(await page.locator('.import-preview').textContent()).includes('undefined'));
    assert.ok((await page.locator('.import-preview').textContent()).includes(`错题${seeded.mistakes}道`));
    page.once('dialog', d => d.dismiss()); await page.locator('#confirm-import').click();
    assert.equal(await page.evaluate(async () => (await import('/src/domain/profile.js')).listProfiles().length), 2);
    page.once('dialog', d => d.accept()); await page.locator('#confirm-import').click(); await page.locator('.profiles-page').waitFor();
    await page.getByText(new RegExp(`恢复完成：1个档案、3条练习记录、${seeded.mistakes}道错题`)).waitFor();
    assert.equal(await page.locator('.profile-card').count(), 1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('km:settings')).sound), true);
    await page.goto(url + '#/mistakes'); assert.equal(await page.locator('.mistake-item').count(), seeded.mistakes);
    pass('真实下载文件命名/格式正确，预览错题数正确，覆盖可取消且回导保留错题徽章设置'); await context.close();
  }
  {
    const { context, page, url } = await open(); await fixture(page, url); const payload = await exported(page, url);
    await page.goto(url + '#/settings');
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    const cases = ['bad-json', '{"profiles":[null]}', '{"__proto__":{"x":1}}', JSON.stringify({ ...payload, version: '99.0' })];
    for (let i = 0; i < cases.length; i++) { await file(page, cases[i], `bad-${i}.json`); await page.locator('.import-errors').waitFor(); assert.equal(await page.locator('#confirm-import').count(), 0); }
    assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort())), before);
    pass('坏JSON、null档案、危险属性和未来版本在预览前拦截，不产生页面异常或覆盖'); await context.close();
  }
  {
    const { context, page, url } = await open(); await fixture(page, url); const payload = await exported(page, url);
    await page.goto(url + '#/settings');
    for (let i = 0; i < 2; i++) {
      await file(page, payload, `merge-${i}.json`); page.once('dialog', d => d.accept()); await page.locator('#confirm-import').click(); await page.locator('.profiles-page').waitFor();
      if (i === 0) await page.goto(url + '#/settings');
    }
    assert.equal(await page.evaluate(async () => (await import('/src/domain/history.js')).listHistory().length), 3);
    pass('合并模式按编号去重，重复导入不新增重复历史'); await context.close();
  }
  {
    const { context, page, url } = await open(); await fixture(page, url); const payload = await exported(page, url);
    await page.goto(url + '#/settings'); await file(page, payload); await page.locator('#import-mode').selectOption('overwrite');
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    await page.evaluate(() => { window.savedSet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith('km:')) throw new DOMException('full', 'QuotaExceededError'); return window.savedSet.call(this, k, v); }; });
    page.once('dialog', d => d.accept()); await page.locator('#confirm-import').click(); await page.locator('.import-errors').waitFor();
    assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort())), before);
    assert.ok(!(await page.locator('.import-errors').textContent()).includes('已恢复原有数据'));
    await page.evaluate(() => Storage.prototype.setItem = window.savedSet);
    pass('暂存阶段持续配额失败不清空原数据，界面不谎报恢复成功'); await context.close();
  }
  {
    const { context, page, url } = await open(); await fixture(page, url); const payload = await exported(page, url);
    await page.goto(url + '#/settings'); await file(page, payload); await page.locator('#import-mode').selectOption('overwrite');
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    await page.evaluate(() => { window.savedSet = Storage.prototype.setItem; let n = 0; Storage.prototype.setItem = function(k, v) { if (k.startsWith('km:') && ++n >= 3) throw new DOMException('full', 'QuotaExceededError'); return window.savedSet.call(this, k, v); }; });
    page.once('dialog', d => d.accept()); await page.locator('#confirm-import').click(); await page.getByRole('button', { name: '重试数据恢复', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => !!localStorage.getItem('km:__transaction__')), true);
    await page.reload(); await page.locator('.settings-page').waitFor();
    // 比较业务数据：meta 的访问时间会在启动更新，原档案数据不能改变。
    const after = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => k !== 'km:meta').sort()));
    const oldBusiness = JSON.stringify(JSON.parse(before).filter(([k]) => k !== 'km:meta'));
    assert.equal(after, oldBusiness);
    pass('写入中断保留恢复日志，刷新启动恢复后业务数据与操作前一致'); await context.close();
  }
  {
    const { context, page, url } = await open(); await fixture(page, url);
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['home', 'practice', 'history', 'mistakes', 'stats', 'profiles', 'settings']) {
        await page.goto(url + '#/' + route); await page.locator('#app h1').waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route}@${width}`);
        const small = await page.locator('#app button:visible').evaluateAll(buttons => buttons.filter(b => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map(b => b.textContent));
        assert.deepEqual(small, [], `${route}@${width}`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url + '#/profiles'); await page.screenshot({ path: path.join(root, '.tmp/c-profiles-mobile.png'), fullPage: true });
    await page.goto(url + '#/settings'); await page.screenshot({ path: path.join(root, '.tmp/c-settings-mobile.png'), fullPage: true });
    pass('ABC七页面在360/390/1440px无横向溢出，可见按钮触控区达到44px'); await context.close();
  }
  {
    const { context, page, url } = await open(true);
    await page.waitForFunction(() => document.querySelector('#pwa-panel')?.dataset.ready === 'true' && !!navigator.serviceWorker.controller);
    const workerVersion = (await fs.readFile(path.join(root, 'sw.js'), 'utf8')).match(/const VERSION = '([^']+)'/)[1];
    assert.equal(await page.locator('#pwa-panel').getAttribute('data-version'), workerVersion);
    await context.setOffline(true); await page.goto(url + '#/profiles'); await page.getByRole('button', { name: '创建档案', exact: true }).click(); await page.getByRole('button', { name: '创建档案', exact: true }).click();
    assert.equal(await page.locator('.profile-card').count(), 2);
    await page.goto(url + '#/settings'); const payload = await exported(page, url); await file(page, payload); await page.locator('#import-mode').selectOption('overwrite');
    page.once('dialog', d => d.accept()); await page.locator('#confirm-import').click(); await page.locator('.profiles-page').waitFor();
    await page.reload(); assert.equal(await page.locator('.profile-card').count(), 2);
    await page.goto(url + '#/stats'); await page.reload(); await page.locator('.stats-page').waitFor();
    pass('子目录发布配置下离线建档、备份恢复、刷新和统计正常，新模块全部可用'); await context.close();
  }
  {
    const { context, page, url } = await open(false, true);
    await page.goto(url + '#/settings'); await page.locator('#settings-sound').check();
    await page.getByText('音效设置仅本次打开有效。', { exact: true }).waitFor();
    const payload = await exported(page, url); await file(page, payload);
    page.once('dialog', d => d.accept()); await page.locator('#confirm-import').click();
    await page.locator('.import-errors').waitFor();
    assert.ok((await page.locator('.import-errors').textContent()).includes('本地存储不可用'));
    pass('存储不可用时明确提示临时设置，拒绝伪装为持久化导入'); await context.close();
  }
  assert.deepEqual(errors, []);
  const result = { executedAt: new Date().toISOString(), checks, errors, browser: 'isolated headless Edge; viewport simulation, not a physical phone' };
  await fs.writeFile(path.join(root, '.tmp/c-browser-results.json'), JSON.stringify(result, null, 2) + '\n');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
