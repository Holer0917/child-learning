/** B02 自定义题量的独立浏览器验证，不读写用户预览中的数据。 */
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
  const input = page.getByRole('textbox', { name: '自定义题量（5～100）' });
  const checkCount = async expected => {
    assert.equal(await input.inputValue(), String(expected));
    assert.equal(await page.locator('#count-confirmation').textContent(), `本次将生成 ${expected} 道题`);
    assert.equal(await page.locator('#generate-paper').getAttribute('aria-label'), `开始出题 · ${expected} 道`);
    const selected = await page.locator('.count-options [aria-pressed="true"]').allTextContents();
    assert.deepEqual(selected, [10, 20, 30, 50].includes(expected) ? [String(expected)] : []);
  };
  const setCount = async value => { await input.fill(value); await input.press('Tab'); };

  await checkCount(30);
  for (const n of [10, 20, 30, 50]) {
    await page.getByRole('button', { name: String(n), exact: true }).click();
    await checkCount(n);
    assert.equal(await page.evaluate(() => document.activeElement.id), `count-${n}`);
  }
  checks.push('PASS: 默认 30 题；10/20/30/50 快捷值同步输入框、选中状态、确认文字和出题按钮，保留键盘焦点');

  for (const n of [5, 100, 37]) {
    await setCount(String(n));
    await checkCount(n);
    await page.locator('#generate-paper').click();
    assert.equal(await page.locator('.question-item').count(), n);
    assert.ok((await page.locator('.paper-meta').textContent()).includes(`共 ${n} 道`));
  }
  checks.push('PASS: 自定义 5/100/37 经失焦确认后分别生成相同题数，非快捷值不误亮快捷按钮');

  for (const [raw, expected, message] of [
    ['0', 5, '已调整为 5 道'], ['4', 5, '已调整为 5 道'], ['-5', 5, '已调整为 5 道'],
    ['101', 100, '已调整为 100 道'], ['999999999999999999999999', 100, '已调整为 100 道'],
    ['', 37, '题量不能为空'], ['   ', 37, '题量不能为空'],
    ['2.5', 37, '请输入 5～100 的整数'], ['abc', 37, '请输入 5～100 的整数'],
    ['37abc', 37, '请输入 5～100 的整数'], ['1e2', 37, '请输入 5～100 的整数'],
    ['NaN', 37, '请输入 5～100 的整数'], ['Infinity', 37, '请输入 5～100 的整数']
  ]) {
    await setCount('37');
    await setCount(raw);
    await checkCount(expected);
    assert.ok((await page.locator('#count-feedback').textContent()).includes(message), raw);
  }
  await setCount(' 037 ');
  await checkCount(37);
  assert.equal(await page.locator('#count-feedback').textContent(), '');
  checks.push('PASS: 越界整数纠正到 5/100；空白、小数、字母、混合字符、指数等恢复上次有效值并提示；首尾空格与前导零规范化');

  await input.fill('');
  await input.pressSequentially('37');
  assert.equal(await input.inputValue(), '37');
  assert.equal(await input.evaluate(node => node === document.activeElement && node.selectionStart === 2), true);
  await input.press('Enter');
  await checkCount(37);
  assert.equal(await input.evaluate(node => node === document.activeElement), true);
  await input.fill('');
  await input.pressSequentially('10');
  assert.equal(await input.inputValue(), '10', '输入第一个 1 时不能提前纠正为 5');
  await input.press('Enter');
  await checkCount(10);
  checks.push('PASS: 清空后逐字输入 37/10 不丢焦点或提前纠正；回车确认后焦点仍在输入框');

  await input.fill('73');
  await page.locator('#generate-paper').click();
  await checkCount(73);
  assert.equal(await page.locator('.question-item').count(), 73);
  await input.fill('101');
  assert.equal(await page.locator('.paper-block').count(), 0, '编辑题量立即移除旧卷，防止开始旧练习');
  await page.locator('#generate-paper').click();
  await checkCount(100);
  assert.equal(await page.locator('.question-item').count(), 100);
  assert.ok((await page.locator('#count-feedback').textContent()).includes('已调整为 100 道'));
  await input.fill('37abc');
  await page.getByRole('button', { name: '10', exact: true }).click();
  await checkCount(10);
  assert.equal(await page.locator('#count-feedback').textContent(), '');
  await input.fill('');
  await page.getByRole('button', { name: '50', exact: true }).click();
  await checkCount(50);
  checks.push('PASS: 未先失焦时单击出题即确认并生成；纠正提示保留；单击快捷值生效，旧预览立即失效');

  await selectGrade(page, '三年级');
  await openKnowledge(page);
  await page.getByRole('button', { name: '全不选', exact: true }).click();
  await page.locator('#kp-G3-01').check();
  await page.getByRole('searchbox').fill('多位数');
  await page.locator('#kp-confirm').click();
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  await toSettings(page);
  await page.getByRole('button', { name: '挑战', exact: true }).click();
  await page.locator('#limit-minutes').selectOption('3');
  await input.fill('37');
  await input.press('Enter');
  assert.ok((await page.locator('.practice-summary').textContent()).includes('三年级'));
  await openKnowledge(page);
  assert.deepEqual(await page.getByRole('checkbox', { checked: true }).evaluateAll(nodes => nodes.map(n => n.id)), ['kp-G3-01']);
  assert.equal(await page.getByRole('searchbox').inputValue(), '');
  await page.locator('#kp-cancel').click();
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  await toSettings(page);
  assert.equal(await page.getByRole('button', { name: '挑战', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#limit-minutes').inputValue(), '3');
  await page.locator('#generate-paper').click();
  assert.equal(await page.locator('.question-item').count(), 37);
  await page.getByRole('button', { name: '开始答题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor();
  const session = await page.evaluate(() => {
    const pid = JSON.parse(localStorage.getItem('km:active'));
    return JSON.parse(localStorage.getItem(`km:quiz:active:${pid}`));
  });
  assert.equal(session.paper.questions.length, 37);
  assert.equal(session.paper.options.requested, 37);
  assert.ok(session.paper.questions.every(q => q.kpId === 'G3-01'));
  assert.equal(session.limitMs, 180000);
  checks.push('PASS: 自定义题量不重置已确认年级、知识点、难度和倒计时；重开选择器重置搜索；37 道同卷答题保留3分钟设置');

  const layoutContext = await browser.newContext();
  let layout = await layoutContext.newPage();
  layout.on('pageerror', error => errors.push(error.message));
  await layout.goto(base + '/#/practice'); await toSettings(layout);
  await openKnowledge(layout);
  await layout.getByRole('button', { name: '全不选', exact: true }).click();
  await layout.locator('#kp-G1-01').check();
  await layout.locator('#kp-confirm').click();
  await layout.locator('.kp-dialog').waitFor({ state: 'detached' });
  await toSettings(layout);
  await layout.locator('#custom-count').fill('100');
  await layout.locator('#generate-paper').click();
  const actual = await layout.locator('.question-item').count();
  assert.ok(actual > 0 && actual < 100, '单一小题库应报告可用题数不足');
  assert.ok((await layout.locator('.warn-text').textContent()).includes(`少出 ${100 - actual} 道`));
  assert.ok((await layout.locator('.paper-meta').textContent()).includes(`共 ${actual} 道`));
  await layout.getByRole('button', { name: '开始答题', exact: true }).click();
  await layout.locator('#quiz-answer').waitFor();
  const shortSession = await layout.evaluate(() => {
    const pid = JSON.parse(localStorage.getItem('km:active'));
    return JSON.parse(localStorage.getItem(`km:quiz:active:${pid}`));
  });
  assert.equal(shortSession.paper.questions.length, actual);
  assert.equal(shortSession.paper.options.requested, 100);
  assert.equal(shortSession.paper.options.count, actual);
  checks.push('PASS: 单一有限题库请求 100 道时保留不足提示和实际题数，开始答题使用实际生成数量');

  // 布局使用独立数据环境，避免未完成练习的离页确认拦截布局页导航。
  await layoutContext.close();
  const responsiveContext = await browser.newContext();
  layout = await responsiveContext.newPage();
  layout.on('pageerror', error => errors.push(error.message));
  for (const scheme of ['light', 'dark']) {
    await layout.emulateMedia({ colorScheme: scheme });
    for (const width of [360, 390, 768, 1440]) {
      await layout.setViewportSize({ width, height: 900 });
      await layout.goto(base + '/#/practice'); await toSettings(layout);
      await layout.locator('#custom-count').fill('2.5');
      await layout.locator('#custom-count').press('Enter');
      const metrics = await layout.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        background: getComputedStyle(document.body).backgroundColor,
        sizes: [...document.querySelectorAll('#custom-count, .count-options button, #generate-paper')]
          .map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })),
        fontSize: parseFloat(getComputedStyle(document.querySelector('#custom-count')).fontSize)
      }));
      assert.equal(metrics.overflow, false, `${width}px ${scheme} 横向溢出`);
      assert.equal(metrics.background, 'rgb(255, 255, 255)');
      assert.ok(metrics.sizes.every(s => s.height >= 44 && s.width >= 44));
      assert.ok(metrics.fontSize >= 16);
      if (scheme === 'light' && [390, 1440].includes(width)) {
        await layout.locator('#custom-count').fill('37');
        await layout.locator('#custom-count').press('Enter');
        await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
        await layout.screenshot({ path: path.join(root, '.tmp', `b02-count-${width}.png`), fullPage: true });
      }
    }
  }
  checks.push('PASS: 360/390/768/1440px 与浅/深系统主题均为白底，无横向溢出；题量输入与按钮 ≥44px，输入字号 ≥16px');
  assert.deepEqual(errors, []);
  checks.push('PASS: 自定义题量全流程无页面 JavaScript 异常');
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await fs.writeFile(path.join(root, '.tmp', 'b02-browser-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), checks }, null, 2));
  console.log(checks.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
