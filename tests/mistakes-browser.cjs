// 独立 Edge 上下文与随机回环端口，不读取个人浏览器档案，不发布网页。
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), checks = [], errors = [];
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'), release = url.pathname.startsWith('/release/');
    const pathname = decodeURIComponent(release ? url.pathname.slice(8) : url.pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    let data = await fs.readFile(file);
    if (path.extname(file) === '.html' && !release) data = Buffer.from(data.toString().replace('</head>', '<meta name="kidsmath-development" content="true"></head>'));
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
});
let browser, base, page;
const pass = s => { checks.push(`PASS: ${s}`); console.log(checks.at(-1)); };
const reset = async () => {
  await page.goto(base + '/?a-test-reset=' + Date.now() + '#/home');
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.getByRole('heading', { name: '开始', exact: true }).waitFor();
};
const current = () => page.evaluate(async () => (await import(new URL('./src/app/quizSession.js', location.href))).resumeSession());
const seedWrong = async (n = 1, kp = 'G2-01') => page.evaluate(async ({ n, kp }) => {
  const { generatePaper } = await import(new URL('./src/domain/generator.js', location.href));
  const { settleSession } = await import(new URL('./src/domain/grader.js', location.href));
  const { archiveSession } = await import(new URL('./src/domain/mistakes.js', location.href));
  const { write } = await import(new URL('./src/core/storage.js', location.href));
  const { getActiveProfile } = await import(new URL('./src/domain/profile.js', location.href));
  const p = generatePaper({ kpIds: [kp], count: Math.max(5, n), types: ['horizontal'], seed: 3 });
  p.questions = p.questions.slice(0, n);
  const r = { ...settleSession(p, Object.fromEntries(p.questions.map(q => [q.id,
    { userAnswer: '-999', correct: false, skipped: false }]))), id: 'source', profileId: getActiveProfile().id };
  write(`sessions:${r.profileId}`, [r]); archiveSession(r);
}, { n, kp });
const finishViaApi = async () => {
  await page.evaluate(async () => {
    const app = await import(new URL('./src/app/quizSession.js', location.href));
    let s;
    while ((s = app.resumeSession())) {
      const q = s.paper.questions[s.cursor];
      if (!s.attempts[q.id]) app.recordAttempt(q.answer);
      app.advance();
    }
    (await import(new URL('./src/core/router.js', location.href))).go('/result');
  });
  await page.locator('.result-page').waitFor();
};
(async () => {
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await reset();
  await page.evaluate(async () => {
    const { generatePaper } = await import('/src/domain/generator.js');
    const app = await import('/src/app/quizSession.js');
    app.createSession(generatePaper({ kpIds: ['G2-01'], count: 5, seed: 1, types: ['horizontal'] }));
  });
  await page.goto(base + '/#/quiz?start=1');
  await page.locator('#quiz-answer').fill('-999'); await page.locator('#submit-answer').click();
  await page.locator('#variant-from-answer').waitFor();
  await page.locator('#next-question').click(); await finishViaApi();
  await page.getByRole('link', { name: '查看错题本', exact: true }).click();
  await page.locator('.mistake-item').waitFor(); assert.equal(await page.locator('.mistake-item').count(), 1);
  pass('普通答题首次错题自动归档，成绩页可进入错题本');

  await page.locator('.mistake-check input').check();
  await page.getByRole('button', { name: '生成重练卷并开始答题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor(); assert.equal((await current()).paper.questions.length, 1);
  await page.reload(); await page.getByRole('button', { name: '继续练习', exact: true }).click();
  assert.equal((await current()).mode, 'retry');
  await page.locator('#quiz-answer').fill((await current()).paper.questions[0].answer);
  await page.locator('#submit-answer').click(); await page.locator('#next-question').click();
  await page.locator('.result-page').waitFor();
  await page.getByRole('link', { name: '查看错题本', exact: true }).click();
  await page.getByRole('button', { name: '已攻克', exact: true }).click();
  assert.equal(await page.locator('.mistake-item').count(), 1);
  pass('1道错题可重练，刷新恢复 retry 模式，首次答对自动攻克');

  const historyBefore = await page.evaluate(async () => {
    const { read } = await import('/src/core/storage.js'); const { getActiveProfile } = await import('/src/domain/profile.js');
    return JSON.stringify(read(`sessions:${getActiveProfile().id}`));
  });
  await page.locator('#clear-mastered').click();
  assert.ok((await page.locator('dialog').innerText()).includes('将清理 1 道'));
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.locator('.mistake-item').count(), 1);
  await page.locator('#clear-mastered').click(); await page.getByRole('button', { name: '确认清理', exact: true }).click();
  await page.reload(); assert.equal(await page.locator('.mistake-item').count(), 0);
  assert.equal(await page.evaluate(async () => {
    const { read } = await import('/src/core/storage.js'); const { getActiveProfile } = await import('/src/domain/profile.js');
    return JSON.stringify(read(`sessions:${getActiveProfile().id}`));
  }), historyBefore);
  pass('清理前展示数量，取消不删除，确认后旧成绩不变且刷新不复造错题');

  await reset(); await seedWrong(1, 'G1-01');
  await page.evaluate(async () => {
    const { read, write } = await import('/src/core/storage.js'); const { getActiveProfile } = await import('/src/domain/profile.js');
    const { generatePaper, dedupeKey } = await import('/src/domain/generator.js');
    const pid = getActiveProfile().id, store = read(`mistakes:${pid}`), item = store.items[0], q = item.question;
    const candidates = generatePaper({ kpIds: ['G1-01'], count: 100, types: ['horizontal'], seed: 2 }).questions;
    const keep = new Set(candidates.filter(c => dedupeKey(c) !== dedupeKey(q)).slice(0, 3).map(c => dedupeKey(c)));
    const excluded = new Set();
    for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) {
      const key = dedupeKey({ ...q, params: { a, b } }); if (!keep.has(key)) excluded.add(key);
    }
    item.sourcePaperKeys = [...excluded]; write(`mistakes:${pid}`, store);
  });
  await page.goto(base + '/#/mistakes'); await page.locator('.mistake-check input').check();
  const variant = page.getByRole('button', { name: '举一反三，每题 5 道变式', exact: true });
  page.once('dialog', async d => { assert.ok(d.message().includes('实际生成 3 道')); await d.dismiss(); });
  await variant.click(); assert.equal(await current(), null);
  page.once('dialog', async d => { assert.ok(d.message().includes('少 2 道')); await d.accept(); });
  await variant.click(); await page.locator('#quiz-answer').waitFor();
  assert.equal((await current()).paper.questions.length, 3); await finishViaApi();
  assert.ok((await page.locator('#perfect-feedback').innerText()).includes('这个知识点掌握得不错'));
  pass('仅剩3道时确认实际题数；取消不开始，确认可答题并显示变式全对反馈');
  await page.getByRole('button', { name: '再来一组变式题', exact: true }).click();
  await page.getByRole('button', { name: '重练原题', exact: true }).waitFor();
  assert.equal(await current(), null);
  await page.getByRole('button', { name: '重练原题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor(); assert.equal((await current()).mode, 'retry');
  pass('再来一组排除上一组，题库耗尽明确提示并提供重练原题');

  await reset();
  await page.evaluate(async () => {
    const { SYLLABUS } = await import('/src/domain/syllabus.js'); const { generatePaper } = await import('/src/domain/generator.js');
    const { archiveSession } = await import('/src/domain/mistakes.js'); const { settleSession } = await import('/src/domain/grader.js');
    const { getActiveProfile } = await import('/src/domain/profile.js'); const { write } = await import('/src/core/storage.js');
    const questions = SYLLABUS.map(k => generatePaper({ kpIds: [k.id], count: 5, types: [k.types[0]], seed: 2 }).questions[0])
      .map((q, i) => ({ ...q, id: `q${i}` }));
    const r = { ...settleSession({ id: 'all-kp', questions }, Object.fromEntries(questions.map(q => [q.id,
      { userAnswer: '-999', correct: false, skipped: false }]))), id: 'source', profileId: getActiveProfile().id };
    write(`sessions:${r.profileId}`, [r]); archiveSession(r);
  });
  await page.goto(base + '/#/mistakes'); await page.getByRole('button', { name: '全选当前筛选', exact: true }).click();
  page.once('dialog', async d => { assert.ok(d.message().includes('剩余 4 道原错题')); await d.accept(); });
  await page.getByRole('button', { name: '举一反三，每题 5 道变式', exact: true }).click();
  await page.locator('#quiz-answer').waitFor();
  assert.equal((await current()).paper.variantRemainingIds.length, 4);
  await page.reload(); await page.getByRole('button', { name: '继续练习', exact: true }).click();
  await finishViaApi(); await page.getByRole('button', { name: '继续下一批变式（剩余 4 道原错题）', exact: true }).click();
  await page.locator('#quiz-answer').waitFor(); assert.equal((await current()).paper.sourceMistakeIds.length, 4);
  assert.equal((await current()).paper.variantRemainingIds.length, 0);
  pass('24道原错题明确分批，刷新保留剩余批次，成绩页可继续最后4道原错题');

  await reset(); await seedWrong();
  await page.goto(base + '/#/stats');
  assert.equal(await page.locator('.stats-chart').count(), 0);
  assert.equal(await page.getByText('练习记录不足，暂无法生成趋势图', { exact: true }).count(), 1);
  await page.evaluate(async () => {
    const { write } = await import('/src/core/storage.js'); const { getActiveProfile } = await import('/src/domain/profile.js');
    const pid = getActiveProfile().id;
    write(`sessions:${pid}`, [10, 50, 70, 95].map((correct, i) => ({ id: `s${i}`, profileId: pid, finishedAt: Date.now() + i,
      total: 100, correct, wrong: 100 - correct, skipped: 0, elapsedMs: 1000, compressed: true,
      kpAnswered: { [`G1-0${i + 1}`]: 100 }, kpCorrect: { [`G1-0${i + 1}`]: correct } })));
  });
  await page.reload(); await page.getByRole('button', { name: '最近 7 次', exact: true }).click();
  assert.equal(await page.locator('#range-7').getAttribute('aria-pressed'), 'true');
  assert.ok((await page.locator('.trend-change').innerText()).includes('上升 25.0 个百分点'));
  await page.getByRole('button', { name: '查看数据表', exact: true }).click();
  assert.equal(await page.locator('.stats-table tbody tr').count(), 4);
  assert.equal(await page.locator('.mastery-track').count(), 4);
  assert.equal(await page.locator('.priority-practice li').count(), 3);
  assert.equal(await page.locator('.activity-day').count(), 56);
  assert.equal(await page.locator('.badge-item').count(), 3);
  pass('少于2次不绘图；范围、环比、文字表、升序掌握度、薄弱前三名、56日日历和徽章齐备');
  const layouts = [];
  for (const route of ['stats', 'mistakes']) {
    await page.goto(base + '/#/' + route);
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const fit = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
        buttons: [...document.querySelectorAll('#app button, #app .btn')].every(b => b.getBoundingClientRect().height >= 44) }));
      assert.equal(fit.overflow, false, `${route} ${width}`); assert.equal(fit.buttons, true);
      layouts.push({ route, width, ...fit });
    }
  }
  await page.goto(base + '/#/stats'); await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, '.tmp', 'a-stats-mobile.png'), fullPage: true });
  await page.locator('.priority-practice a').first().click();
  await page.locator('#choose-kp').click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 1);
  await page.locator('#kp-confirm').click();
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  assert.ok(page.url().includes('kp=G1-01'));
  pass('错题/统计页360、390、1440px无横向溢出且按钮≥44px；薄弱点快捷入口选中对应知识点');

  await reset();
  await page.evaluate(async () => {
    const { generatePaper } = await import('/src/domain/generator.js'); const app = await import('/src/app/quizSession.js');
    app.createSession(generatePaper({ kpIds: ['G2-01'], count: 5, seed: 1, types: ['horizontal'] }));
  });
  await page.goto(base + '/#/quiz?start=1');
  await page.locator('#quiz-answer').fill('-999'); await page.locator('#submit-answer').click();
  page.once('dialog', async d => { assert.ok(d.message().includes('先结束并保存')); await d.accept(); });
  await page.locator('#variant-from-answer').click(); await page.locator('#quiz-answer').waitFor();
  assert.equal((await current()).mode, 'variant');
  pass('答错后的举一反三先确认结算，随后建立独立变式会话');

  await reset();
  await page.evaluate(async () => {
    const { generatePaper } = await import('/src/domain/generator.js'); const app = await import('/src/app/quizSession.js');
    const original = Storage.prototype.setItem;
    window.__aRestoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(k, v) {
      if (k.startsWith('km:mistakes:')) throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, k, v);
    };
    app.createSession(generatePaper({ kpIds: ['G2-01'], count: 5, seed: 1, types: ['horizontal'] }));
    for (const q of app.resumeSession().paper.questions) { app.recordAttempt('-999'); app.advance(); }
  });
  await page.evaluate(async () => (await import('/src/core/router.js')).go('/result'));
  await page.locator('.result-page').waitFor();
  await page.getByRole('button', { name: '重试错题归档', exact: true }).waitFor();
  await page.evaluate(() => window.__aRestoreStorage());
  await page.getByRole('button', { name: '重试错题归档', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '重试错题归档', exact: true }).count(), 0);
  const restored = await page.evaluate(async () => {
    const { getActiveProfile } = await import('/src/domain/profile.js'); const { read } = await import('/src/core/storage.js');
    const { readStore } = await import('/src/domain/mistakes.js'); const pid = getActiveProfile().id;
    return { sessions: read(`sessions:${pid}`).length, mistakes: readStore(pid).items.length };
  });
  assert.deepEqual(restored, { sessions: 1, mistakes: 5 });
  pass('错题写入失败明确提示，恢复后重试归档，成绩只保留一条');

  const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await offlineContext.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/release/#/home');
  await page.waitForFunction(() => document.body.textContent.includes('离线已就绪'));
  await seedWrong();
  await offlineContext.setOffline(true);
  await page.goto(base + '/release/#/mistakes'); await page.locator('.mistake-check input').check();
  await page.getByRole('button', { name: '生成重练卷并开始答题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor(); await page.reload();
  await page.getByRole('button', { name: '继续练习', exact: true }).click(); await finishViaApi();
  await page.getByRole('link', { name: '查看学习统计', exact: true }).click();
  await page.locator('.stats-chart').waitFor();
  assert.ok((await page.locator('.stats-page').innerText()).includes('知识点掌握度'));
  pass('子路径发布模式离线打开错题本、刷新重练、结算回写及学习统计均可运行');
  assert.deepEqual(errors, []);
  const result = { executedAt: new Date().toISOString(), browser: browser.version(), checks, layouts, pageErrors: errors };
  await fs.writeFile(path.join(root, '.tmp', 'a-browser-results.json'), JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); await new Promise(r => server.close(r));
});
