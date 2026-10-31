/** B07：独立测试数据；核心路径只用 Tab/Shift+Tab/Enter/Space/文字键操作。 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const checks = [], focusWalks = [], errors = [];
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(file);
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain' }); res.end(data);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const newPage = async (width = 1440) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };
  const snapshotFocus = page => page.evaluate(() => {
    const node = document.activeElement, style = getComputedStyle(node), rect = node.getBoundingClientRect();
    return { tag: node.tagName, id: node.id, label: node.getAttribute('aria-label') ?? node.textContent.slice(0, 70),
      width: parseFloat(style.outlineWidth), outline: style.outlineStyle, visible: node.getClientRects().length > 0 && !node.closest('[hidden],.visually-hidden') && !node.matches(':disabled'),
      inView: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth };
  });
  const assertFocus = async (page, expected) => {
    assert.equal(await page.locator(expected).evaluate(node => node === document.activeElement), true, `焦点应位于 ${expected}，实际 ${JSON.stringify(await snapshotFocus(page))}`);
    const s = await snapshotFocus(page);
    assert.notEqual(s.tag, 'BODY'); assert.ok(s.visible); assert.ok(s.inView);
    assert.ok(s.width >= 2 && s.outline !== 'none', `键盘焦点缺少 2px 轮廓：${JSON.stringify(s)}`);
  };
  const tabTo = async (page, selector, backwards = false) => {
    for (let n = 0; n < 100; n++) {
      if (await page.locator(selector).evaluateAll(nodes => nodes.includes(document.activeElement))) {
        await assertFocus(page, selector); return;
      }
      await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab');
      assert.notEqual((await snapshotFocus(page)).tag, 'BODY', `寻找 ${selector} 时焦点丢失`);
    }
    throw new Error(`Tab 无法到达 ${selector}`);
  };
  const typeValue = async (page, value) => { await page.keyboard.press('Control+A'); await page.keyboard.type(value); };
  const active = page => page.evaluate(() => JSON.parse(localStorage.getItem(`km:quiz:active:${JSON.parse(localStorage.getItem('km:active'))}`)));
  const waitQuestion = (page, n) => page.getByText(`第 ${n} / 共 10 题`, { exact: true }).waitFor();
  const walk = async (page, name) => {
    // 从页面标题反向到页首链接，再按实际 DOM 顺序逐一 Tab，不点击或注入焦点。
    await tabTo(page, '.brand', true);
    const count = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')]
      .filter(node => !node.matches(':disabled') && node.getClientRects().length && !node.closest('[hidden],.visually-hidden')).length);
    const visited = [await snapshotFocus(page)];
    for (let i = 1; i < count; i++) {
      await page.keyboard.press('Tab');
      const s = await snapshotFocus(page);
      assert.notEqual(s.tag, 'BODY'); assert.ok(s.visible && s.inView && s.width >= 2 && s.outline !== 'none', JSON.stringify(s));
      visited.push(s);
    }
    // 反向遍历验证与正向相反，没有 tabindex>0、隐藏或 CSS order 造成的跳位。
    for (let i = visited.length - 2; i >= 0; i--) {
      await page.keyboard.press('Shift+Tab');
      const s = await snapshotFocus(page);
      assert.deepEqual([s.tag, s.id, s.label], [visited[i].tag, visited[i].id, visited[i].label]);
    }
    focusWalks.push({ name, controls: count, sequence: visited.map(({ tag, id, label }) => ({ tag, id, label })) });
  };

  const page = await newPage();
  await page.goto(base + '/#/home');
  await assertFocus(page, '#app h1');
  await walk(page, '开始页');
  await tabTo(page, '.entry-practice'); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: '出题练习', exact: true }).waitFor();
  await assertFocus(page, '#app h1');
  await walk(page, '出题台初始');
  checks.push('PASS AC-KB.1/5: 开始页与出题台双向 Tab，所有现有控件可达，轮廓≥2px，切页聚焦主标题');

  await tabTo(page, '#grade-2'); await page.keyboard.press('Space'); await assertFocus(page, '#grade-2');
  await tabTo(page, '#grade-1', true); await page.keyboard.press('Enter'); await assertFocus(page, '#grade-1');
  await tabTo(page, '#choose-kp'); await page.keyboard.press('Enter');
  await assertFocus(page, '#kp-dialog-title');
  await tabTo(page, '#kp-search'); await page.keyboard.type('加法'); await assertFocus(page, '#kp-search');
  await tabTo(page, '#clear-kp-search'); await page.keyboard.press('Space'); await assertFocus(page, '#kp-search');
  await tabTo(page, '#kp-select-none'); await page.keyboard.press('Enter'); await assertFocus(page, '#kp-select-none');
  await tabTo(page, '#kp-G1-01');
  await page.keyboard.press('Enter'); assert.equal(await page.locator('#kp-G1-01').isChecked(), true);
  await page.keyboard.press('Space'); assert.equal(await page.locator('#kp-G1-01').isChecked(), false);
  await page.keyboard.press('Space'); assert.equal(await page.locator('#kp-G1-01').isChecked(), true);
  await assertFocus(page, '#kp-G1-01');
  await tabTo(page, '#kp-confirm'); await page.keyboard.press('Enter');
  await page.locator('.kp-dialog').waitFor({ state: 'detached' }); await assertFocus(page, '#choose-kp');
  await tabTo(page, '#count-20'); await page.keyboard.press('Space'); await assertFocus(page, '#count-20');
  await tabTo(page, '#custom-count'); await typeValue(page, '10'); await page.keyboard.press('Enter'); await assertFocus(page, '#custom-count');
  await tabTo(page, '#difficulty-easy'); await page.keyboard.press('Enter'); await assertFocus(page, '#difficulty-easy');
  await tabTo(page, '#difficulty-normal'); await page.keyboard.press('Space'); await assertFocus(page, '#difficulty-normal');
  await tabTo(page, '#type-compare'); await page.keyboard.press('Enter');
  await tabTo(page, '#type-horizontal', true); await page.keyboard.press('Space'); await page.keyboard.press('Enter');
  await tabTo(page, '#type-compare'); await page.keyboard.press('Space');
  await tabTo(page, '#limit-minutes'); await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('#limit-minutes').inputValue(), '1'); await page.keyboard.press('ArrowUp');
  await tabTo(page, '#generate-paper'); await page.keyboard.press('Enter');
  await page.locator('.paper-block').waitFor(); await assertFocus(page, '#paper-heading');
  assert.equal(await page.locator('.paper-total').textContent(), '共 10 道');
  await tabTo(page, '#toggle-answers'); await page.keyboard.press('Space'); assert.equal(await page.locator('.question-answer').count(), 10);
  await page.keyboard.press('Enter'); assert.equal(await page.locator('.question-answer').count(), 0);
  await assertFocus(page, '#toggle-answers');
  checks.push('PASS AC-KB.2/3: 仅键盘完成年级、搜索/清空、知识点 Enter/Space、题量、难度、题型、计时设置与出题；预览焦点和答案开关正常');

  await tabTo(page, '.paper-block > button.btn-primary'); await page.keyboard.press('Enter');
  await page.locator('#quiz-answer').waitFor(); await assertFocus(page, '#quiz-answer');
  await walk(page, '答题页编辑态');
  await tabTo(page, '#quiz-answer');
  await page.keyboard.press('Tab'); await assertFocus(page, '.keypad button:first-child');
  await page.keyboard.press('Space'); assert.equal(await page.locator('#quiz-answer').inputValue(), '1');
  await assertFocus(page, '.keypad button:first-child');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#quiz-answer').inputValue(), '12');
  await assertFocus(page, '.keypad button:nth-child(2)');
  await tabTo(page, '#quiz-answer', true); await typeValue(page, '999999');
  await page.keyboard.down('Enter'); await assertFocus(page, '#next-question');
  for (let i = 0; i < 3; i++) await page.keyboard.down('Enter');
  assert.equal((await active(page)).cursor, 0); assert.equal(Object.keys((await active(page)).attempts).length, 1);
  await page.keyboard.up('Enter');
  assert.equal(await page.locator('#next-question').getAttribute('aria-describedby'), 'answer-status');
  await page.keyboard.press('Tab'); await assertFocus(page, '#retry-answer'); await page.keyboard.press('Space');
  await assertFocus(page, '#quiz-answer');
  await typeValue(page, (await active(page)).paper.questions[0].answer); await page.keyboard.press('Enter');
  await waitQuestion(page, 2); await assertFocus(page, '#quiz-answer');
  let s = await active(page);
  assert.equal(s.attempts[s.paper.questions[0].id].correct, false); assert.equal(s.retries[s.paper.questions[0].id].correct, true);
  checks.push('PASS AC-KB.1/2/4/5: 按键先于提交/跳过的 Tab 顺序与视觉一致；Space/Enter 输入保留按键焦点；答错→反馈→订正→下一题焦点正常，首次错误不覆盖');

  await page.keyboard.type('abc'); await page.keyboard.press('Enter'); await assertFocus(page, '#quiz-answer');
  assert.equal(await page.locator('#quiz-answer').getAttribute('aria-invalid'), 'true');
  assert.ok((await page.locator('#quiz-answer').getAttribute('aria-describedby')).includes('answer-error'));
  assert.equal(Object.keys((await active(page)).attempts).length, 1);
  await typeValue(page, (await active(page)).paper.questions[1].answer);
  assert.equal(await page.locator('#quiz-answer').getAttribute('aria-invalid'), null);
  await page.locator('#quiz-answer').evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
  assert.equal(Object.keys((await active(page)).attempts).length, 1, '合成的 IME 组合事件不得提交');
  await page.keyboard.down('Enter');
  for (let i = 0; i < 3; i++) await page.keyboard.down('Enter');
  await waitQuestion(page, 3); await assertFocus(page, '#quiz-answer');
  await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  s = await active(page); assert.equal(s.cursor, 2); assert.equal(Object.keys(s.attempts).length, 2);
  checks.push('PASS: 非法输入不计分并定位输入/错误，订正清除 aria-invalid；按住 Enter 跨反馈与自动切题不重复提交或跳题；合成 IME Enter 不提交');

  await tabTo(page, '#skip-question'); await page.keyboard.press('Space'); await assertFocus(page, '#next-question');
  await page.keyboard.press('Enter'); await waitQuestion(page, 4); await assertFocus(page, '#quiz-answer');
  await page.keyboard.type('12');
  await page.keyboard.press('Shift+Tab'); await assertFocus(page, '#exit-quiz'); await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  await assertFocus(page, 'dialog button:first-child');
  await page.keyboard.press('Shift+Tab'); await assertFocus(page, 'dialog button:last-child');
  await page.keyboard.press('Tab'); await assertFocus(page, 'dialog button:first-child');
  await page.keyboard.press('Tab'); await assertFocus(page, 'dialog button:last-child');
  await page.keyboard.press('Tab'); await assertFocus(page, 'dialog button:first-child');
  await page.keyboard.press('Escape'); await assertFocus(page, '#exit-quiz');
  assert.equal(await page.locator('#quiz-answer').inputValue(), '12');
  await page.keyboard.press('Enter'); await assertFocus(page, 'dialog button:first-child'); await page.keyboard.press('Space');
  await assertFocus(page, '#exit-quiz');
  assert.equal(await page.locator('#quiz-answer').inputValue(), '12');
  checks.push('PASS: 键盘跳过/继续正常；退出对话框首焦点为继续、Tab/Shift+Tab 闭环；Escape/继续关闭后恢复退出按钮及原草稿');

  await page.keyboard.press('Tab'); await assertFocus(page, '#quiz-answer');
  await typeValue(page, (await active(page)).paper.questions[3].answer); await page.keyboard.press('Enter');
  await waitQuestion(page, 5); await page.keyboard.type('7');
  await tabTo(page, '.brand', true);
  page.once('dialog', dialog => dialog.dismiss()); await page.keyboard.press('Enter');
  await page.waitForURL('**/#/quiz');
  assert.ok((await active(page)).draft === '7');
  assert.equal(await page.locator('.nav-link[href="#/practice"]').getAttribute('aria-current'), 'page');
  page.once('dialog', dialog => dialog.accept()); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: '开始', exact: true }).waitFor(); await assertFocus(page, '#app h1');
  await tabTo(page, '.resume-card a'); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: '继续上次练习？', exact: true }).waitFor(); await assertFocus(page, '#app h1');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await assertFocus(page, '#quiz-answer');
  assert.equal(await page.locator('#quiz-answer').inputValue(), '7');
  assert.equal((await active(page)).cursor, 4);
  for (let n = 5; n <= 10; n++) {
    s = await active(page); await typeValue(page, s.paper.questions[s.cursor].answer); await page.keyboard.press('Enter');
    if (n < 10) { await waitQuestion(page, n + 1); await assertFocus(page, '#quiz-answer'); }
  }
  await page.locator('.result-page').waitFor(); await assertFocus(page, '#app h1');
  assert.equal(await page.locator('.score').textContent(), '80.0%');
  assert.deepEqual(await page.locator('.metric strong').allTextContents(), ['8', '1', '1']);
  await walk(page, '成绩页');
  await tabTo(page, '.detail-back'); await page.keyboard.press('Enter');
  await page.locator('.history-page').waitFor(); await assertFocus(page, '#app h1');
  await walk(page, '成绩历史');
  checks.push('PASS AC-KB.3/4/5: 仅键盘完成 10 题和结算（8 对/1 错/1 跳过=80.0%）；离开取消/确认及首页继续均保留草稿与题号，成绩/历史切页焦点正确');

  // 其余已实现路由/空态，覆盖 360px 与 1440px；未开发 A/C 页面不宣称可操作验收通过。
  for (const width of [360, 1440]) {
    const routePage = await newPage(width);
    for (const route of ['home', 'practice', 'history', 'mistakes', 'quiz', 'result', 'result?id=missing', 'not-found']) {
      await routePage.goto(base + '/#/' + route);
      const target = route === 'not-found' ? '#app a' : '#app h1';
      await assertFocus(routePage, target); await walk(routePage, `${width}px/${route}`);
      assert.equal(await routePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await routePage.context().close();
  }
  checks.push('PASS AC-KB.1/5: 360/1440px 当前 6 条路由、空成绩/失效详情与 404 双向 Tab 走查；无隐藏焦点、无横向溢出，轮廓≥2px');

  const more = await newPage(); await more.goto(base + '/#/home');
  await more.evaluate(async () => {
    const { generatePaper } = await import('/src/domain/generator.js');
    const { createSession, recordAttempt, finishSession } = await import('/src/app/quizSession.js');
    for (let n = 0; n < 25; n++) {
      const paper = generatePaper({ kpIds: ['G1-01'], count: 5, types: ['horizontal'], seed: n + 1 });
      createSession(paper); recordAttempt(paper.questions[0].answer); finishSession('exit');
    }
  });
  await more.goto(base + '/#/history?limit=0');
  await tabTo(more, '.load-history'); await more.keyboard.press('Enter');
  assert.equal(await more.locator('.history-record').count(), 25);
  assert.equal(await more.locator('.history-record').nth(20).evaluate(node => node === document.activeElement), true);
  const newFocus = await snapshotFocus(more); assert.ok(newFocus.visible && newFocus.inView && newFocus.width >= 2);
  await more.context().close();
  checks.push('PASS: 25 次隔离测试练习，键盘加载第 21～25 条后焦点移至第 21 条，加载按钮消失也不丢失焦点');

  const timeout = await newPage(); await timeout.goto(base + '/#/home');
  await timeout.evaluate(async () => {
    const { generatePaper } = await import('/src/domain/generator.js');
    const { createSession } = await import('/src/app/quizSession.js');
    createSession(generatePaper({ kpIds: ['G1-01'], count: 5, types: ['horizontal'], seed: 1 }), { limitMs: 60000 });
    const key = `km:quiz:active:${JSON.parse(localStorage.getItem('km:active'))}`;
    const s = JSON.parse(localStorage.getItem(key)); s.startAt = Date.now() - 55000; s.questionAt = s.startAt; s.savedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(s));
  });
  // 改查询串触发整页加载，避免同文档 hash 跳转仍使用注入前的内存恢复点。
  await timeout.goto(base + '/?b07=timeout#/quiz?start=1'); await timeout.locator('#quiz-answer').waitFor();
  await timeout.keyboard.press('Shift+Tab'); await timeout.keyboard.press('Enter');
  await timeout.getByRole('dialog').waitFor();
  await timeout.getByRole('heading', { name: '时间到，来看看成绩', exact: true }).waitFor();
  await assertFocus(timeout, '#app h1'); assert.equal(await timeout.locator('dialog[open]').count(), 0);
  await timeout.context().close();
  checks.push('PASS: 退出对话框打开期间倒计时到期仍自动结算，模态层移除，成绩主标题获得焦点');

  assert.deepEqual(errors, []); checks.push('PASS: 全部键盘路径未捕获页面 JavaScript 异常 0 条');
  await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await fs.writeFile(path.join(root, '.tmp', 'b07-browser-results.json'), JSON.stringify({ executedAt: new Date().toISOString(), browser: await browser.version(), checks, focusWalks }, null, 2));
  console.log(checks.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); server.close();
});
