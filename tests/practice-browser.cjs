/** B01 知识点选择的用户路径验证；数据仅存在于隔离浏览器上下文。 */
const { chromium } = require('playwright');
const { toKnowledgeStep, openKnowledge, toSettings } = require('./practice-navigation.cjs');
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
  await toKnowledgeStep(page);
  assert.equal(await page.locator('.kp-list').count(), 0);
  await openKnowledge(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'kp-dialog-title');
  await page.locator('#kp-select-none').click();
  await page.locator('#kp-cancel').click();
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  assert.ok((await page.locator('#choose-kp').textContent()).includes('已选 8 个'));
  await openKnowledge(page);
  await page.locator('.kp-dialog').getByRole('button', { name: '三年级', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  assert.ok((await page.locator('.card-description').textContent()).includes('一年级'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'choose-kp');
  checks.push('PASS: 默认只显示知识点入口；取消和Escape丢弃选择及年级草稿，返回入口焦点');
  await openKnowledge(page);
  const names = new Set();
  for (const grade of ['一年级', '二年级', '三年级']) {
    await page.locator('.kp-dialog').getByRole('button', { name: grade, exact: true }).click();
    assert.equal(await page.getByRole('checkbox').count(), 8);
    const points = await page.locator('.kp-item').evaluateAll(items => items.map(item => ({
      name: item.querySelector('.kp-name').textContent,
      meta: item.querySelector('.kp-level').textContent,
      desc: item.querySelector('.kp-desc').textContent,
      types: item.querySelector('.kp-types').textContent,
      checked: item.querySelector('input').checked
    })));
    points.forEach((p, i) => {
      names.add(p.name);
      assert.ok(p.meta.includes(grade) && p.meta.includes(`第 ${i + 1} 项`) && p.meta.includes('★'));
      assert.ok(p.desc.length > 5 && p.types.startsWith('支持题型：') && p.types.length > 5);
      assert.equal(p.checked, true);
    });
  }
  assert.equal(names.size, 24);
  checks.push('PASS: 三个年级各 8 个知识点，共 24 个；名称、年级、顺序、星级、说明、题型均可见');

  await page.locator('.kp-dialog').getByRole('button', { name: '一年级', exact: true }).click();
  const search = page.getByRole('searchbox', { name: '搜索当前年级知识点' });
  await search.fill('进位');
  assert.equal(await page.getByRole('checkbox').count(), 2);
  await search.focus();
  await search.press('End');
  await search.pressSequentially('abc');
  assert.equal(await search.inputValue(), '进位abc');
  assert.equal(await search.evaluate(input => input === document.activeElement), true);
  assert.ok(await page.locator('.kp-empty').isVisible());
  assert.equal(await page.getByRole('checkbox').count(), 0);
  assert.equal(await page.locator('.kp-bulk-actions button:disabled').count(), 3);
  await search.fill('地基');
  assert.equal(await page.getByRole('checkbox').count(), 1);
  assert.equal(await page.locator('.kp-name').textContent(), '10 以内加法');
  await search.fill('  地基  ');
  assert.equal(await page.getByRole('checkbox').count(), 1);
  const composition = await search.evaluate(input => {
    input.focus();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.value = 'tui';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'tui', isComposing: true }));
    const sameDuring = document.activeElement === input && input.isConnected;
    input.value = '退位';
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '退位' }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '退位' }));
    return sameDuring && document.activeElement === input && input.value === '退位';
  });
  assert.equal(composition, true);
  assert.equal(await page.getByRole('checkbox').count(), 2);
  await search.fill('<img src=x onerror=alert(1)>');
  assert.ok(await page.locator('.kp-empty').isVisible());
  assert.equal(await page.locator('.knowledge-picker img').count(), 0);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.getByRole('checkbox').count(), 8);
  assert.equal(await search.evaluate(input => input === document.activeElement), true);
  checks.push('PASS: 名称/说明实时搜索、首尾空格、空结果、特殊字符、清空；连续输入不丢焦点');

  await page.getByRole('button', { name: '全不选', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
  await page.getByRole('checkbox', { name: /^10 以内加法/ }).check();
  await page.getByRole('button', { name: '反选', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 7);
  assert.equal(await page.getByRole('checkbox', { name: /^10 以内加法/ }).isChecked(), false);
  await page.getByRole('button', { name: '全选', exact: true }).click();
  await search.fill('进位');
  await page.getByRole('button', { name: '全不选搜索结果', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 0);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 6);
  assert.equal(await page.getByRole('checkbox', { name: /^10 以内加法/ }).isChecked(), true);
  await search.fill('进位');
  await page.getByRole('button', { name: '反选搜索结果', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 2);
  await page.getByRole('button', { name: '清空搜索', exact: true }).click();
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 8);
  checks.push('PASS: 全选/全不选/反选正确；搜索批量操作不改变隐藏项，清空后选择保持');

  await search.fill('进位');
  await page.locator('.kp-dialog').getByRole('button', { name: '三年级', exact: true }).click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 8);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'kp-grade-3');
  await search.fill('分数');
  assert.equal(await page.getByRole('checkbox').count(), 1);
  assert.equal(await page.locator('.kp-name').textContent(), '同分母分数加减法');
  const box = page.getByRole('checkbox');
  await box.focus();
  await page.keyboard.press('Space');
  assert.equal(await page.getByRole('checkbox').isChecked(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'kp-G3-07');
  await page.keyboard.press('Space');
  assert.equal(await page.getByRole('checkbox').isChecked(), true);
  checks.push('PASS: 年级切换清空关键词并选择新年级默认组合；键盘切换复选框后焦点保留');

  await page.locator('.kp-dialog').getByRole('button', { name: '一年级', exact: true }).click();
  await page.getByRole('button', { name: '全不选', exact: true }).click();
  await page.locator('#kp-confirm').click();
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#practice-next-2').isEnabled(), false);
  assert.equal(await page.locator('#practice-step-3').isEnabled(), false);
  await openKnowledge(page);
  await search.fill('地基');
  await page.getByRole('button', { name: '全选搜索结果', exact: true }).click();
  await page.locator('#kp-confirm').click();
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  await toSettings(page);
  await page.getByRole('button', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: '开始出题 · 10 道', exact: true }).click();
  assert.equal(await page.locator('.question-item').count(), 10);
  const originalPaper = await page.locator('.question-item').allTextContents();
  await openKnowledge(page);
  await search.fill('不存在的知识点');
  assert.equal(await page.locator('.question-item').count(), 0, '第二步不展示试卷或设置');
  await page.locator('#kp-confirm').click();
  await page.locator('.kp-dialog').waitFor({ state: 'detached' });
  await toSettings(page);
  await page.locator('#reopen-preview').click(); await page.locator('.practice-preview').waitFor();
  assert.deepEqual(await page.locator('.question-item').allTextContents(), originalPaper);
  await page.getByRole('button', { name: '开始答题', exact: true }).click();
  await page.locator('#quiz-answer').waitFor();
  const session = await page.evaluate(() => {
    const pid = JSON.parse(localStorage.getItem('km:active'));
    return JSON.parse(localStorage.getItem(`km:quiz:active:${pid}`));
  });
  assert.equal(session.paper.questions.length, 10);
  assert.ok(session.paper.questions.every(q => q.kpId === 'G1-01'));
  checks.push('PASS: 空选择提示；搜索后选定知识点→出题→开始答题，10 道题全部来自所选知识点');

  // 新上下文用于布局检查，避免未完成练习提示影响本次操作区域。
  const layoutContext = await browser.newContext();
  const layout = await layoutContext.newPage();
  for (const scheme of ['light', 'dark']) {
    await layout.emulateMedia({ colorScheme: scheme });
    for (const width of [360, 390, 768, 1440]) {
      await layout.setViewportSize({ width, height: 900 });
      await layout.goto(base + '/#/practice');
      await toKnowledgeStep(layout);
      const compact = await layout.locator('#choose-kp').boundingBox();
      assert.ok(compact.height < 120, '知识点入口应保持紧凑');
      assert.equal(await layout.locator('.kp-item').count(), 0);
      await openKnowledge(layout);
      await layout.getByRole('searchbox').fill('进位');
      const metrics = await layout.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        background: getComputedStyle(document.body).backgroundColor,
        sizes: [...document.querySelectorAll('.kp-search-row button, .kp-bulk-actions button, #kp-search')]
          .map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))
      }));
      assert.equal(metrics.overflow, false, `${width}px ${scheme} 横向溢出`);
      assert.equal(metrics.background, 'rgb(255, 255, 255)');
      assert.ok(metrics.sizes.every(s => s.height >= 44 && s.width >= 44));
      if (scheme === 'light' && [390, 1440].includes(width)) {
        await layout.getByRole('button', { name: '清空搜索', exact: true }).click();
        await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
        await layout.screenshot({ path: path.join(root, '.tmp', `b01-practice-${width}.png`), fullPage: true });
      }
      await layout.locator('#kp-cancel').click();
      await layout.locator('.kp-dialog').waitFor({ state: 'detached' });
    }
  }
  checks.push('PASS: 360/390/768/1440px、浅色/深色系统主题下无横向溢出，保持白底，新增输入和按钮触控区 ≥44px');
  assert.deepEqual(errors, []);
  checks.push('PASS: 用户流程无页面 JavaScript 异常');
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await fs.writeFile(path.join(root, '.tmp', 'b01-browser-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), checks }, null, 2));
  console.log(checks.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
});
