/** B04：按真实出题结果验证预览统计、答案隐藏、同卷答题与响应式布局。 */
const { chromium } = require('playwright');
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
  await page.goto(base + '/#/practice');
  const selectOnly = async (target, ids) => {
    await target.getByRole('button', { name: '全不选', exact: true }).click();
    for (const id of ids) await target.locator(`#kp-${id}`).check();
  };
  const generate = async (target, count) => {
    await target.locator('#custom-count').fill(String(count));
    await target.locator('#generate-paper').click();
  };
  const distribution = async target => target.locator('.distribution-item').evaluateAll(nodes => nodes.map(node => ({
    kpId: node.dataset.kpId, count: Number(node.dataset.count), percent: Number(node.dataset.percent),
    name: node.querySelector('.distribution-name').textContent,
    value: node.querySelector('.distribution-value').textContent
  })));

  await selectOnly(page, ['G1-01', 'G1-03']);
  await generate(page, 10);
  assert.equal(await page.locator('.paper-total').textContent(), '共 10 道');
  assert.equal(await page.locator('.average-value').textContent(), '平均难度 1.5 星');
  assert.deepEqual((await distribution(page)).map(row => [row.kpId, row.count, row.percent]), [['G1-01', 5, 50], ['G1-03', 5, 50]]);
  assert.deepEqual(await page.locator('.preview-star-fill').evaluateAll(nodes => nodes.map(node => node.style.width)), ['100%', '50%', '0%']);
  assert.equal(await page.locator('.average-stars').getAttribute('aria-hidden'), 'true');
  checks.push('PASS: 10 题两知识点各 5 道，显示 50%/50%、平均 1.5 星及半星图示，图示不重复朗读');

  await selectOnly(page, ['G1-01', 'G1-06', 'G1-03']);
  assert.equal(await page.locator('.paper-distribution').count(), 0, '更改条件后旧分布同步失效');
  await generate(page, 7);
  let rows = await distribution(page);
  assert.deepEqual(rows.map(row => [row.kpId, row.count, row.percent]), [['G1-01', 3, 43], ['G1-03', 2, 29], ['G1-06', 2, 29]]);
  assert.equal(await page.locator('.average-value').textContent(), '平均难度 1.6 星');
  assert.ok((await page.locator('.distribution-note').textContent()).includes('合计可能不为 100%'));
  assert.ok(rows.every(row => row.name && row.value === `${row.count} 道 · ${row.percent}%`));
  checks.push('PASS: 7 题按 3/2/2 降序及编号顺序展示，平均按题目加权为 1.6 星；43%+29%+29%=101% 有取整说明');

  await selectOnly(page, ['G1-01']);
  await generate(page, 100);
  const actual = await page.locator('.question-item').count();
  assert.ok(actual > 0 && actual < 100);
  rows = await distribution(page);
  assert.equal(await page.locator('.paper-total').textContent(), `共 ${actual} 道`);
  assert.deepEqual(rows.map(row => [row.kpId, row.count, row.percent]), [['G1-01', actual, 100]]);
  assert.equal(await page.locator('.average-value').textContent(), '平均难度 1.0 星');
  assert.ok((await page.locator('.warn-text').textContent()).includes(`少出 ${100 - actual} 道`));
  checks.push('PASS: 100 题请求触及题库上限时，统计分母与题数均用实际值，唯一知识点显示 100%，难度保留 1.0');

  await page.getByRole('button', { name: '全选', exact: true }).click();
  await generate(page, 30);
  rows = await distribution(page);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 30);
  assert.equal(rows.some(row => row.kpId === 'G1-08'), false, '未生成的知识点不占统计行');
  assert.ok(rows.every((row, i) => !i || row.count <= rows[i - 1].count));
  assert.ok((await page.locator('.paper-warning').allTextContents()).some(text => text.includes('100 以内数的认识与比较')));
  checks.push('PASS: 部分题型不匹配时只统计实际出题知识点，列表降序、题数合计与实际题量一致，跳过说明保留');

  // 五种题型逐一验证预览，保持答案不出现在显示文本中。
  for (const [grade, kpId, type] of [
    ['一年级', 'G1-03', 'horizontal'], ['一年级', 'G1-03', 'vertical'],
    ['一年级', 'G1-08', 'compare'], ['一年级', 'G1-01', 'fill'], ['二年级', 'G2-05', 'chain']
  ]) {
    await page.getByRole('button', { name: grade, exact: true }).click();
    await selectOnly(page, [kpId]);
    if (await page.locator(`#type-${type}`).getAttribute('aria-pressed') !== 'true') await page.locator(`#type-${type}`).click();
    for (const other of ['horizontal', 'vertical', 'compare', 'fill', 'chain'].filter(value => value !== type)) {
      if (await page.locator(`#type-${other}`).getAttribute('aria-pressed') === 'true') await page.locator(`#type-${other}`).click();
    }
    await generate(page, 5);
    assert.equal(await page.locator('.question-item').count(), 5);
    assert.equal(await page.locator(`.question-item[data-type="${type}"]`).count(), 5);
    assert.equal(await page.locator('.distribution-item').count(), 1);
    assert.equal(await page.locator('[data-answer], .question-answer, .answer-key').count(), 0);
    if (type === 'vertical') assert.equal(await page.locator('.preview-vertical').count(), 5);
    else assert.equal(await page.locator('.q-text').count(), 5);
  }
  checks.push('PASS: 横式/竖式/比较/填空/连算五类各 5 道均完整预览，答案不写入预览节点或属性');

  const preview = await page.locator('.question-item').evaluateAll(nodes => nodes.map(node => ({
    id: node.dataset.kpId, text: node.querySelector('.q-text').textContent, visible: node.querySelector('.question-content').innerText.trim()
  })));
  await page.getByRole('button', { name: '开始答题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor();
  const session = await page.evaluate(() => {
    const pid = JSON.parse(localStorage.getItem('km:active'));
    return JSON.parse(localStorage.getItem(`km:quiz:active:${pid}`));
  });
  assert.deepEqual(session.paper.questions.map(q => q.text), preview.map(row => row.text));
  assert.deepEqual(session.paper.stats, { total: 5, avgStar: 3, dist: { 'G2-05': 5 } });
  assert.ok(preview.every(row => row.visible.replace(/\s/g, '') === row.text.replace(/\s/g, '')));
  checks.push('PASS: 预览没有追加答案，开始答题使用同一题序与内容，Paper.stats 一并保留进会话');

  const layoutContext = await browser.newContext();
  const layout = await layoutContext.newPage();
  layout.on('pageerror', error => errors.push(error.message));
  for (const scheme of ['light', 'dark']) {
    await layout.emulateMedia({ colorScheme: scheme });
    for (const width of [360, 390, 768, 1440]) {
      await layout.setViewportSize({ width, height: 900 });
      await layout.goto(base + '/#/practice');
      await selectOnly(layout, ['G1-01', 'G1-06', 'G1-03']);
      await generate(layout, 7);
      const metrics = await layout.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        background: getComputedStyle(document.body).backgroundColor,
        names: [...document.querySelectorAll('.distribution-name')].every(node => node.scrollWidth <= node.clientWidth),
        button: document.querySelector('.paper-block > button').getBoundingClientRect().height
      }));
      assert.equal(metrics.overflow, false, `${width}px ${scheme} 横向溢出`);
      assert.equal(metrics.background, 'rgb(255, 255, 255)');
      assert.equal(metrics.names, true);
      assert.ok(metrics.button >= 44);
      if (scheme === 'light' && [390, 1440].includes(width)) {
        await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
        await layout.locator('.paper-block').screenshot({ path: path.join(root, '.tmp', `b04-preview-${width}.png`) });
      }
    }
  }
  checks.push('PASS: 360/390/768/1440px 与浅/深系统主题下白底无横向溢出，长名称换行，开始答题按钮高度 ≥44px');
  assert.deepEqual(errors, []);
  checks.push('PASS: 上述预览与答题路径页面未捕获异常为 0');
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await fs.writeFile(path.join(root, '.tmp', 'b04-browser-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), checks }, null, 2));
  console.log(checks.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
