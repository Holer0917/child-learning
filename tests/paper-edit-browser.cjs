/** B05：真实用户路径验证预览调整，数据仅位于隔离浏览器上下文。 */
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
  const errors = [];
  const newPage = async viewport => {
    const context = await browser.newContext({ viewport: viewport ?? { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/#/practice'); await toSettings(page);
    return page;
  };
  const selectOnly = async (page, ids) => {
    await openKnowledge(page);
    await page.getByRole('button', { name: '全不选', exact: true }).click();
    for (const id of ids) await page.locator(`#kp-${id}`).check();
    await page.locator('#kp-confirm').click();
    await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  await toSettings(page);
  };
  const chooseTypes = async (page, wanted) => {
    for (const type of wanted) if (await page.locator(`#type-${type}`).getAttribute('aria-pressed') !== 'true') await page.locator(`#type-${type}`).click();
    for (const type of ['horizontal', 'vertical', 'compare', 'fill', 'chain'].filter(type => !wanted.includes(type))) {
      if (await page.locator(`#type-${type}`).getAttribute('aria-pressed') === 'true') await page.locator(`#type-${type}`).click();
    }
  };
  const generate = async (page, count) => {
    await toSettings(page);
    await page.locator('#custom-count').fill(String(count));
    await page.locator('#generate-paper').click(); await page.locator('.practice-preview').waitFor();
  };
  const rows = async page => page.locator('.question-item').evaluateAll(nodes => nodes.map(node => ({
    id: node.querySelector('.question-delete').id,
    label: node.querySelector('.question-delete').getAttribute('aria-label'),
    text: node.querySelector('.q-text')?.textContent ?? node.querySelector('.preview-vertical').getAttribute('aria-label'),
    answer: node.querySelector('.question-answer')?.textContent ?? null
  })));

  const page = await newPage();
  await selectGrade(page, '三年级');
  await selectOnly(page, ['G3-01']);
  await page.locator('#limit-minutes').selectOption('3');
  await generate(page, 30);
  const original = await rows(page);
  assert.equal(original.length, 30);
  assert.equal(await page.locator('#toggle-answers').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.question-answer').count(), 0);
  await page.locator('#toggle-answers').click();
  const shown = await rows(page);
  assert.equal(shown.filter(row => row.answer).length, 30);
  for (const row of shown) {
    const [, a, b] = row.text.match(/(\d+) × (\d+)/);
    assert.equal(row.answer, `答案：${Number(a) * Number(b)}`);
  }
  assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-answers');
  await page.locator('#toggle-answers').press('Space');
  assert.equal(await page.locator('.question-answer').count(), 0);
  await page.locator('#toggle-answers').click();
  checks.push('PASS: 默认隐藏；显示后 30 道乘法答案独立重算一致；Space 可收起，焦点保留在开关');

  await page.getByRole('button', { name: '删除第 7 题', exact: true }).click();
  let edited = await rows(page);
  assert.deepEqual(edited.map(row => row.id), original.filter((_, i) => i !== 6).map(row => row.id));
  assert.deepEqual(edited.map(row => row.text), shown.filter((_, i) => i !== 6).map(row => row.text));
  assert.deepEqual(edited.map(row => row.answer), shown.filter((_, i) => i !== 6).map(row => row.answer));
  assert.deepEqual(edited.map(row => row.label), Array.from({ length: 29 }, (_, i) => `删除第 ${i + 1} 题`));
  assert.equal(await page.locator('.paper-total').textContent(), '共 29 道');
  assert.equal(await page.locator('.distribution-value').textContent(), '29 道 · 100%');
  assert.equal(await page.locator('.average-value').textContent(), '平均难度 3.0 星');
  assert.equal(await page.locator('.question-answer').count(), 29);
  assert.equal(await page.locator('.paper-removed').textContent(), '已手动删除 1 道');
  assert.equal(await page.locator('.warn-text').count(), 0, '手动删题不能误报题库不足');
  assert.equal(await page.evaluate(() => document.activeElement.id), original[7].id);
  checks.push('PASS: 删除第 7 题后剩 29 道，编号连续、剩余 ID 稳定，答案及统计同步，焦点移到原第 8 题');

  await page.locator('#regenerate-paper').click();
  let fresh = await rows(page);
  assert.equal(fresh.length, 30);
  assert.ok(fresh.every(row => !original.some(old => old.text === row.text)), '包括已删除的原题也不得立即重出');
  assert.equal(await page.locator('.question-answer').count(), 0);
  assert.equal(await page.locator('#toggle-answers').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.paper-removed').count(), 0);
  assert.equal(await page.locator('.practice-preview').count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'regenerate-paper');
  checks.push('PASS: 重新生成恢复原请求 30 题，与上一生成批次（含已删题）零重用；答案关闭、统计重置、倒计时保留');

  for (let i = 0; i < 30; i++) await page.getByRole('button', { name: '删除第 1 题', exact: true }).click();
  assert.equal(await page.locator('.question-item').count(), 0);
  assert.equal(await page.locator('.paper-total').textContent(), '共 0 道');
  assert.equal(await page.locator('.average-value').textContent(), '平均难度 —');
  assert.equal(await page.locator('.distribution-item').count(), 0);
  assert.equal(await page.getByRole('button', { name: '开始答题', exact: true }).isDisabled(), true);
  assert.equal(await page.locator('#toggle-answers').isDisabled(), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'regenerate-paper');
  assert.equal(/NaN|Infinity/.test(await page.locator('.paper-block').textContent()), false);
  await page.locator('#regenerate-paper').press('Enter');
  edited = await rows(page);
  assert.equal(edited.length, 30);
  assert.ok(edited.every(row => !fresh.some(old => old.text === row.text)));
  checks.push('PASS: 可删到 0，空卷禁用开始与答案开关，无 NaN；Enter 重新生成恢复 30 道新题');

  for (let i = 0; i < 27; i++) await page.getByRole('button', { name: '删除第 1 题', exact: true }).click();
  const toStart = await rows(page);
  assert.equal(toStart.length, 3);
  await page.getByRole('button', { name: '开始答题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor();
  const session = await page.evaluate(() => {
    const pid = JSON.parse(localStorage.getItem('km:active'));
    return JSON.parse(localStorage.getItem(`km:quiz:active:${pid}`));
  });
  assert.deepEqual(session.paper.questions.map(q => q.text), toStart.map(row => row.text));
  assert.deepEqual(session.paper.questions.map(q => `delete-${q.id}`), toStart.map(row => row.id));
  assert.deepEqual(session.paper.stats, { total: 3, avgStar: 3, dist: { 'G3-01': 3 } });
  assert.equal(session.paper.options.count, 3);
  assert.equal(session.paper.options.requested, 30);
  assert.equal(session.paper.removedCount, 27);
  assert.equal(session.limitMs, 180000);
  assert.equal(await page.locator('.question-answer').count(), 0);
  checks.push('PASS: 调整到 3 题仍能开始，进入同一份调整后的卷子，ID/题序/stats/count/原请求量及 3 分钟设置一致');

  const limited = await newPage();
  await selectOnly(limited, ['G1-01']);
  await generate(limited, 20);
  const limitedOriginal = await rows(limited);
  await limited.locator('#regenerate-paper').click();
  const limitedFresh = await rows(limited);
  assert.ok(limitedFresh.length > 0 && limitedFresh.length < 20);
  assert.ok(limitedFresh.every(row => !limitedOriginal.some(old => old.text === row.text)));
  assert.equal(await limited.locator('.paper-total').textContent(), `共 ${limitedFresh.length} 道`);
  assert.ok((await limited.locator('.warn-text').textContent()).includes(`少出 ${20 - limitedFresh.length} 道`));
  await generate(limited, 100);
  await limited.locator('#toggle-answers').click();
  const exhaustedOriginal = await rows(limited);
  await limited.locator('#regenerate-paper').click();
  assert.deepEqual(await rows(limited), exhaustedOriginal);
  assert.equal(await limited.locator('#toggle-answers').getAttribute('aria-pressed'), 'true');
  assert.ok((await limited.locator('#paper-error').textContent()).includes('原预览已保留'));
  checks.push('PASS: 剩余题库不足时少出并报告实际题数；耗尽时保留原题、答案显示状态和统计，给出明确错误');

  const ratio = await newPage();
  await selectOnly(ratio, ['G1-01', 'G1-03']);
  await ratio.getByRole('button', { name: '简单', exact: true }).click();
  await generate(ratio, 10);
  await ratio.locator('.question-item[data-difficulty="1"] .question-delete').first().click();
  assert.equal(await ratio.getByRole('button', { name: '开始答题', exact: true }).isDisabled(), true);
  assert.ok((await ratio.locator('.paper-readiness').textContent()).includes('至少 7 道 1 星题'));
  await ratio.locator('.question-item[data-difficulty="2"] .question-delete').first().click();
  assert.equal(await ratio.getByRole('button', { name: '开始答题', exact: true }).isEnabled(), true);
  assert.equal(await ratio.locator('.paper-readiness').count(), 0);
  for (let i = 0; i < 2; i++) await ratio.locator('.question-item[data-difficulty="2"] .question-delete').first().click();
  assert.equal(await ratio.locator('.paper-total').textContent(), '共 6 道');
  assert.equal(await ratio.locator('.average-value').textContent(), '平均难度 1.0 星');
  assert.equal(await ratio.locator('.distribution-item').count(), 1);
  assert.equal(await ratio.locator('.distribution-value').textContent(), '6 道 · 100%');
  checks.push('PASS: 删题导致简单比例不足会阻止开始，恢复比例后可继续；删完 2 星题后均值变 1.0、分布仅余 1 项 100%');

  const formats = await newPage();
  for (const [grade, kpId, type, pattern] of [
    ['三年级', 'G3-01', 'vertical', /^\d+$/], ['三年级', 'G3-07', 'horizontal', /^\d+(?:\/\d+)?$/],
    ['三年级', 'G3-08', 'horizontal', /^\d+(?:\.\d)?$/], ['三年级', 'G3-05', 'horizontal', /^\d+余[1-9]\d*$/],
    ['一年级', 'G1-08', 'compare', /^[<>=]$/], ['一年级', 'G1-01', 'fill', /^\d+$/], ['二年级', 'G2-05', 'chain', /^\d+$/]
  ]) {
    await selectGrade(formats, grade);
    await selectOnly(formats, [kpId]);
    await chooseTypes(formats, [type]);
    await generate(formats, 5);
    assert.equal(await formats.locator('.question-answer').count(), 0);
    await formats.locator('#toggle-answers').click();
    const answers = await formats.locator('.question-answer').allTextContents();
    assert.equal(answers.length, 5);
    assert.ok(answers.every(answer => pattern.test(answer.slice(3))), `${kpId} 答案格式`);
    assert.ok(await formats.locator('.question-answer').evaluateAll(nodes => nodes.every(node => !node.childElementCount)));
    await formats.locator('#toggle-answers').click();
    assert.equal(await formats.locator('.question-answer').count(), 0);
  }
  checks.push('PASS: 竖式/分数/小数/余数/比较/填空/连算的答案均可显示并彻底收起，符号通过文本呈现');

  for (const scheme of ['light', 'dark']) {
    await formats.emulateMedia({ colorScheme: scheme });
    for (const width of [360, 390, 768, 1440]) {
      await formats.setViewportSize({ width, height: 900 });
      await formats.goto(base + '/#/practice'); await toSettings(formats);
      await selectGrade(formats, '三年级');
      await selectOnly(formats, ['G3-01']);
      await chooseTypes(formats, ['horizontal', 'vertical']);
      await generate(formats, 5);
      await formats.locator('#toggle-answers').click();
      const metrics = await formats.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        background: getComputedStyle(document.body).backgroundColor,
        sizes: [...document.querySelectorAll('.paper-actions button, .question-delete, .paper-block > button')]
          .map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
      }));
      assert.equal(metrics.overflow, false, `${width}px ${scheme} 横向溢出`);
      assert.equal(metrics.background, 'rgb(255, 255, 255)');
      assert.ok(metrics.sizes.every(size => size.width >= 44 && size.height >= 44));
      if (scheme === 'light' && [390, 1440].includes(width)) {
        await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
        await formats.locator('.paper-block').screenshot({ path: path.join(root, '.tmp', `b05-edit-${width}.png`) });
      }
    }
  }
  checks.push('PASS: 360/390/768/1440px、浅/深系统主题均白底且无横向溢出，显示答案后各操作触控区 ≥44px');
  assert.deepEqual(errors, []);
  checks.push('PASS: 上述调整、异常与答题路径未捕获页面异常为 0');
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await fs.writeFile(path.join(root, '.tmp', 'b05-browser-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), checks }, null, 2));
  console.log(checks.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
