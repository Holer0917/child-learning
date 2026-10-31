// 三步向导：真实按钮导航、草稿边界和同卷答题；使用独立浏览器档案。
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { toKnowledgeStep, openKnowledge, toSettings } = require('./practice-navigation.cjs');
const root = path.resolve(__dirname, '..'), checks = [], layouts = [], errors = [];
const publicMode = process.env.WIZARD_PUBLIC === '1';
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    let data = await fs.readFile(file);
    if (file.endsWith('.html')) data = Buffer.from(data.toString().replace('</head>', '<meta name="kidsmath-development" content="true"></head>'));
    res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'text/plain' }).end(data);
  } catch { res.writeHead(404).end(); }
});
const pass = text => { checks.push('PASS: ' + text); console.log(checks.at(-1)); };
let browser;
(async () => {
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const sites = publicMode ? [{ id: 'formal', base: 'https://holer0917.github.io/child-learning/' }, { id: 'preview', base: 'https://holer0917.github.io/child-learning-b10-preview/' }]
    : [{ id: 'local', base: `http://127.0.0.1:${server.address().port}/` }];
  for (const site of sites) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(site.base + '?wizard=4#/practice');
    assert.equal(await page.locator('#grade-1').count(), 1);
    assert.equal(await page.locator('#choose-kp, #custom-count').count(), 0);
    assert.ok(await page.locator('#practice-step-2').isDisabled()); assert.ok(await page.locator('#practice-step-3').isDisabled());
    pass(`${site.id} 初始仅第一步，后两步锁定且控件不进入DOM或Tab顺序`);
    await page.locator('#grade-2').click(); await page.locator('#practice-next-1').click();
    assert.equal(await page.locator('#practice-step-2').getAttribute('aria-current'), 'step');
    assert.equal(await page.locator('#grade-1, #custom-count').count(), 0);
    await openKnowledge(page); await page.locator('#kp-select-none').click(); await page.locator('#kp-confirm').click();
    await page.locator('.kp-dialog').waitFor({ state: 'detached' });
    assert.ok(await page.locator('#practice-next-2').isDisabled()); assert.ok(await page.locator('#practice-step-3').isDisabled());
    pass(`${site.id} 第一→第二步；空知识点同时阻止下一步和步骤导航跳转`);
    await openKnowledge(page); await page.locator('#kp-G2-01').check(); await page.locator('#kp-confirm').click();
    await page.locator('.kp-dialog').waitFor({ state: 'detached' }); await toSettings(page);
    assert.equal(await page.locator('#practice-step-3').getAttribute('aria-current'), 'step');
    assert.equal(await page.locator('#choose-kp, #grade-1').count(), 0);
    await page.locator('#custom-count').fill('37'); await page.locator('#custom-count').press('Tab');
    await page.locator('#difficulty-hard').click(); await page.locator('#type-compare').click(); await page.locator('#limit-minutes').selectOption('3');
    await page.locator('#practice-back-3').click(); await openKnowledge(page); await page.locator('#kp-select-none').click();
    await page.locator('#kp-cancel').click(); await page.locator('.kp-dialog').waitFor({ state: 'detached' }); await toSettings(page);
    assert.equal(await page.locator('#custom-count').inputValue(), '37'); assert.equal(await page.locator('#limit-minutes').inputValue(), '3');
    assert.equal(await page.locator('#difficulty-hard').getAttribute('aria-pressed'), 'true'); assert.equal(await page.locator('#type-compare').getAttribute('aria-pressed'), 'true');
    pass(`${site.id} 第二→第三步；返回和取消保留题量、难度、题型与倒计时`);
    await page.locator('#difficulty-normal').click(); await page.locator('#type-compare').click(); await page.locator('#generate-paper').click();
    assert.equal(await page.locator('.question-item').count(), 37); const paper = await page.locator('.question-item').allTextContents();
    await page.locator('#practice-step-1').click(); assert.equal(await page.locator('#grade-2').getAttribute('aria-pressed'), 'true');
    await toSettings(page); assert.deepEqual(await page.locator('.question-item').allTextContents(), paper);
    await openKnowledge(page); await page.locator('#kp-confirm').click(); await page.locator('.kp-dialog').waitFor({ state: 'detached' });
    await toSettings(page); assert.deepEqual(await page.locator('.question-item').allTextContents(), paper);
    pass(`${site.id} 已完成步骤可返回；范围不变的前后切换与确认保留原试卷`);
    await page.locator('#practice-step-1').click(); await page.locator('#grade-3').click(); await toSettings(page);
    assert.equal(await page.locator('.paper-block').count(), 0); assert.equal(await page.locator('#custom-count').inputValue(), '37');
    assert.equal(await page.locator('#limit-minutes').inputValue(), '3');
    await openKnowledge(page); assert.equal(await page.getByRole('checkbox', { checked: true }).count(), 8);
    await page.keyboard.press('Escape'); await page.locator('.kp-dialog').waitFor({ state: 'detached' });
    pass(`${site.id} 修改年级恢复对应默认知识点、使旧卷失效，同时保留练习参数`);
    await page.goto(site.base + '#/practice?kp=G3-07'); await page.locator('#custom-count').waitFor();
    assert.ok((await page.locator('.practice-summary').textContent()).includes('1 个知识点'));
    assert.equal(await page.locator('#practice-step-3').getAttribute('aria-current'), 'step');
    pass(`${site.id} 薄弱知识点快捷入口预填范围并直接进入第三步`);
    await openKnowledge(page); await page.goto(site.base + '#/home');
    assert.equal(await page.locator('.kp-dialog').count(), 0); assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
    await page.goto(site.base + '#/practice'); assert.equal(await page.locator('#practice-step-1').getAttribute('aria-current'), 'step');
    pass(`${site.id} 离开清理面板及滚动锁，重新进入恢复第一步`); await context.close();
    for (const [width, height] of [[360, 640], [390, 844], [568, 320], [1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 1000, hasTouch: width < 1000 });
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(site.base + '?wizard=4#/practice');
      for (const step of [1, 2, 3]) {
        assert.equal(await p.locator('.card').count(), 1);
        assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.ok(await p.locator(`#practice-title-0${step}`).isVisible());
        if (width === 390 || width === 1440) await p.screenshot({ path: path.join(root, '.tmp', `wizard-${site.id}-step-${step}-${width}.png`), fullPage: true });
        if (step < 3) await p.locator(`#practice-next-${step}`).click();
      }
      await p.locator('#custom-count').fill('10'); await p.locator('#generate-paper').click();
      assert.equal(await p.locator('.question-item').count(), 10); await p.getByRole('button', { name: '开始答题', exact: true }).click();
      await p.locator('#quiz-answer').waitFor(); layouts.push({ site: site.id, width, height, stages: 3, questionCount: 10 });
      pass(`${site.id} ${width}×${height} 每步仅一个卡片、无横向溢出，三步后能出题和答题`); await ctx.close();
    }
  }
  assert.deepEqual(errors, []); pass('向导、面板及答题无页面JavaScript异常');
  await fs.writeFile(path.join(root, '.tmp', publicMode ? 'wizard-public-results.json' : 'wizard-browser-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), checks, layouts, errors }, null, 2) + '\n');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
