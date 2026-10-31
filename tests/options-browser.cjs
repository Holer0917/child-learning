/** B03 难度、题型组合与异常路径；所有数据均位于独立浏览器环境。 */
const { chromium } = require('playwright');
const { toKnowledgeStep, openKnowledge, toSettings, selectGrade } = require('./practice-navigation.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const checks = [];
const server = http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain' });
    res.end(data);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});

let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/#/practice'); await toSettings(page);
  const generate = async () => { await page.locator('#generate-paper').click(); await page.locator('.practice-preview, [role="alert"]').first().waitFor(); };
  const questions = () => page.locator('.question-item').evaluateAll(nodes => nodes.map(node => ({ ...node.dataset })));
  const selectOnly = async ids => {
    await openKnowledge(page);
    await page.getByRole('button', { name: '全不选', exact: true }).click();
    for (const id of ids) await page.locator(`#kp-${id}`).check();
    await page.locator('#kp-confirm').click();
    await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  await toSettings(page);
  };
  assert.equal(await page.locator('#settings-compatibility, #count-hint, .option-hint').count(), 0);
  await generate();
  let qs = await questions();
  assert.equal(qs.length, 30);
  assert.ok(qs.every(q => q.type === 'horizontal' && q.kpId !== 'G1-08'));
  assert.equal(await page.locator('.paper-warning').count(), 0);
  checks.push('PASS: 默认组合仍能出题；精简说明后结果仍仅含所选横式与支持的知识点');

  await selectOnly(['G1-01', 'G1-03']);
  await toSettings(page);
  await page.getByRole('button', { name: '简单', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'difficulty-easy');
  await generate();
  qs = await questions();
  assert.equal(qs.length, 30);
  assert.ok(qs.filter(q => q.difficulty === '1').length >= 21);
  assert.ok(qs.every(q => ['G1-01', 'G1-03'].includes(q.kpId)));
  assert.ok((await page.locator('.difficulty-result').textContent()).includes('1 星题'));
  await toSettings(page);
  await page.locator('#custom-count').fill('7');
  await generate();
  qs = await questions();
  assert.equal(qs.length, 7);
  assert.ok(qs.filter(q => q.difficulty === '1').length >= 5);
  checks.push('PASS: 简单 30 题至少 21 道 1 星，7 题至少 5 道；比例按实际题量向上取整并显示结果');

  await toSettings(page);
  await page.getByRole('button', { name: '挑战', exact: true }).click();
  assert.equal(await page.locator('.paper-block').count(), 0);
  await generate();
  await page.getByRole('alert').filter({ hasText: '没有 3 星题' }).waitFor();
  assert.equal(await page.locator('.paper-block').count(), 0);
  await page.getByRole('button', { name: '适中', exact: true }).click();
  assert.equal(await page.getByRole('alert').count(), 0);
  await generate();
  assert.equal(await page.locator('.question-item').count(), 7);
  checks.push('PASS: 无 3 星的组合切到挑战后清除旧卷、点击出题时提示并拒绝生成；改为适中可恢复出题');

  await selectGrade(page, '三年级');
  await selectOnly(['G3-01', 'G3-07']);
  await page.getByRole('button', { name: '30', exact: true }).click();
  await toSettings(page);
  await page.getByRole('button', { name: '挑战', exact: true }).click();
  await generate();
  qs = await questions();
  assert.equal(qs.length, 30);
  assert.ok(qs.filter(q => q.difficulty === '3').length >= 15);
  assert.ok(qs.every(q => ['G3-01', 'G3-07'].includes(q.kpId)));
  await toSettings(page);
  await page.getByRole('button', { name: '简单', exact: true }).click();
  await generate();
  await page.getByRole('alert').filter({ hasText: '没有 1 星题' }).waitFor();
  assert.equal(await page.locator('.paper-block').count(), 0);
  checks.push('PASS: 三年级挑战至少 50% 为 3 星；所选项无 1 星时简单档明确拒绝，不增选或改写知识点');

  await selectGrade(page, '一年级');
  await selectOnly(['G1-01']);
  await page.getByRole('button', { name: '适中', exact: true }).click();
  await page.getByRole('button', { name: '竖式', exact: true }).click();
  await page.getByRole('button', { name: '横式', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'type-horizontal');
  await generate();
  await page.getByRole('alert').filter({ hasText: '不支持当前题型' }).waitFor();
  assert.equal(await page.locator('.paper-block').count(), 0);
  await openKnowledge(page);
  await page.locator('#kp-G1-03').check();
  await page.locator('#kp-confirm').click();
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  await toSettings(page);
  await generate();
  qs = await questions();
  assert.equal(qs.length, 30);
  assert.ok(qs.every(q => q.kpId === 'G1-03' && q.type === 'vertical'));
  assert.equal(await page.locator('.preview-vertical').count(), 30);
  assert.ok((await page.locator('.preview-vertical').first().textContent()).includes('─'));
  checks.push('PASS: 仅选不支持竖式的知识点会拒绝；加入支持项后只出匹配知识点的竖式，预览数字分行且有横线');

  await selectGrade(page, '二年级');
  await selectOnly(['G2-01']);
  await page.getByRole('button', { name: '横式', exact: true }).click();
  await generate();
  qs = await questions();
  assert.equal(qs.filter(q => q.type === 'horizontal').length, 15);
  assert.equal(qs.filter(q => q.type === 'vertical').length, 15);
  await toSettings(page);
  await page.locator('#custom-count').fill('37');
  await generate();
  qs = await questions();
  const horizontal = qs.filter(q => q.type === 'horizontal').length;
  assert.equal(qs.length, 37);
  assert.ok(Math.abs(horizontal - (37 - horizontal)) <= 1);
  const previewText = await page.locator('.question-item').allTextContents();
  await page.getByRole('button', { name: '开始答题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor();
  const session = await page.evaluate(() => {
    const pid = JSON.parse(localStorage.getItem('km:active'));
    return JSON.parse(localStorage.getItem(`km:quiz:active:${pid}`));
  });
  assert.equal(session.paper.questions.length, 37);
  assert.deepEqual(session.paper.questions.map(q => ({ kpId: q.kpId, type: q.type, difficulty: String(q.difficulty) })), qs);
  assert.equal(previewText.length, session.paper.questions.length);
  if (session.paper.questions[0].type === 'vertical') assert.ok(await page.locator('.vertical-question').isVisible());
  checks.push('PASS: 同知识点横式/竖式 30 题为 15/15，37 题相差 ≤1；混合卷保持知识点、题型和星级进入答题');

  const layoutContext = await browser.newContext();
  const layout = await layoutContext.newPage();
  layout.on('pageerror', error => errors.push(error.message));
  for (const scheme of ['light', 'dark']) {
    await layout.emulateMedia({ colorScheme: scheme });
    for (const width of [360, 390, 768, 1440]) {
      await layout.setViewportSize({ width, height: 900 });
      await layout.goto(base + '/#/practice'); await toSettings(layout);
      await layout.getByRole('button', { name: '挑战', exact: true }).click();
      const metrics = await layout.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        background: getComputedStyle(document.body).backgroundColor,
        buttons: [...document.querySelectorAll('.difficulty-options button, .type-options button')]
          .map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
      }));
      assert.equal(metrics.overflow, false, `${width}px ${scheme} 提示文字溢出`);
      assert.equal(metrics.background, 'rgb(255, 255, 255)');
      assert.ok(metrics.buttons.every(size => size.width >= 44 && size.height >= 44));
      if (scheme === 'light' && [390, 1440].includes(width)) {
        await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
        await layout.locator('.card:has(#custom-count)').screenshot({ path: path.join(root, '.tmp', `b03-settings-${width}.png`) });
      }
    }
  }
  checks.push('PASS: 360/390/768/1440px、浅/深系统主题下提示不溢出，保持白底，难度/题型触控区 ≥44px');

  const timings = await layout.evaluate(async () => {
    const { generatePaper } = await import('/src/domain/generator.js');
    const cases = [
      { kpIds: ['G1-01', 'G1-03'], difficulty: 'easy' },
      { kpIds: ['G3-01', 'G3-07'], difficulty: 'hard' },
      { kpIds: ['G1-01'], difficulty: 'easy' },
      { kpIds: ['G1-03'], difficulty: 'normal' },
      { kpIds: ['G2-01'], difficulty: 'normal', types: ['horizontal', 'vertical'] }
    ];
    return cases.map(options => {
      const durations = [];
      for (let seed = 1; seed <= 20; seed++) {
        const started = performance.now();
        generatePaper({ count: 100, ...options, seed });
        durations.push(performance.now() - started);
      }
      return { options, samples: durations.length, maxMs: Math.max(...durations), averageMs: durations.reduce((a, b) => a + b, 0) / durations.length };
    });
  });
  const maxMs = Math.max(...timings.map(t => t.maxMs));
  assert.ok(maxMs < 50, `本机 100 题生成样本最大 ${maxMs.toFixed(2)}ms，超过 50ms`);
  checks.push(`PASS: 本机 5 类 100 题请求各 20 次，共 100 次生成计时，观测最大 ${maxMs.toFixed(2)}ms <50ms（含有限题库情况）`);
  assert.deepEqual(errors, []);
  checks.push('PASS: 上述路径页面 JavaScript 未捕获异常为 0');
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await fs.writeFile(path.join(root, '.tmp', 'b03-browser-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), browser: await browser.version(), checks, timings }, null, 2));
  console.log(checks.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
