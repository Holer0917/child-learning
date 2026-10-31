// 运行前安装 playwright 或通过 NODE_PATH 指向其目录。
// 使用独立浏览器数据，不读取日常浏览器档案；本地测试服务器随用例退出。
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const logs = [];
const server = http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (url === '/' ? '/index.html' : url));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain' });
    res.end(await fs.readFile(file));
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
let browser;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const active = () => page.evaluate(() => JSON.parse(localStorage.getItem(`km:quiz:active:${JSON.parse(localStorage.getItem('km:active'))}`)));
  const start = async () => {
    await page.goto(base + '/#/practice');
    await page.locator('#choose-kp').click();
    await page.getByRole('button', { name: '全不选', exact: true }).click();
    await page.getByRole('checkbox', { name: /^10 以内加法/ }).check();
    await page.locator('#kp-confirm').click();
    await page.locator('.kp-dialog').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '10', exact: true }).click();
    await page.getByRole('button', { name: '开始出题 · 10 道', exact: true }).click();
    await page.getByRole('button', { name: '开始答题', exact: true }).click();
    await page.locator('#quiz-answer').waitFor();
  };
  await start();
  await fs.mkdir(path.join(root,'.tmp'),{recursive:true});
  await page.screenshot({path:path.join(root,'.tmp','step2-quiz-mobile.png'),fullPage:true});
  for (const width of [360,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    const fit = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
      font: parseFloat(getComputedStyle(document.querySelector('.quiz-question')).fontSize),
      taps: [...document.querySelectorAll('.key')].every(b => b.getBoundingClientRect().height >= 44) }));
    assert.equal(fit.overflow,false,`overflow at ${width}`); assert.ok(fit.font>=32); assert.ok(fit.taps);
  }
  logs.push('PASS: 360/390/768/1440px 答题页无横向溢出，题字号≥32px，键盘触控区≥44px');
  await page.getByRole('button',{name:'1',exact:true}).click();
  await page.getByRole('button',{name:'删除一位',exact:true}).click();
  assert.equal(await page.locator('#quiz-answer').inputValue(),'');
  await page.locator('#quiz-answer').fill('999999');
  await page.locator('#quiz-answer').press('Enter');
  await page.getByRole('button',{name:'再试一次',exact:true}).waitFor();
  await page.getByRole('button',{name:'再试一次',exact:true}).click();
  const s=await active();
  await page.locator('#quiz-answer').fill(s.paper.questions[0].answer);
  await page.getByRole('button',{name:'提交答案',exact:true}).click();
  await page.getByText('第 2 / 共 10 题',{exact:true}).waitFor();
  logs.push('PASS: 触屏键盘、删除、实体回车提交、错误反馈、订正正确后自动下一题');
  await page.locator('#quiz-answer').fill('12');
  await page.reload();
  await page.getByRole('button',{name:'继续练习',exact:true}).click();
  assert.equal(await page.locator('#quiz-answer').inputValue(),'12');
  assert.equal((await active()).cursor,1);
  logs.push('PASS: 刷新后确认继续，恢复题号、首次成绩与输入草稿');
  await page.locator('#quiz-answer').fill('abc');
  await page.getByRole('button',{name:'提交答案',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'请填写数字'}).waitFor();
  assert.equal(Object.keys((await active()).attempts).length,1);
  await page.getByRole('button',{name:'跳过',exact:true}).click();
  await page.getByRole('button',{name:'下一题',exact:true}).click();
  await page.getByRole('button',{name:'退出练习',exact:true}).click();
  await page.getByRole('button',{name:'继续答题',exact:true}).click();
  assert.ok(await active());
  await page.getByRole('button',{name:'退出练习',exact:true}).click();
  await page.getByRole('button',{name:'确认结束',exact:true}).click();
  await page.locator('.result-page').waitFor();
  assert.equal(await page.locator('.score').textContent(),'0.0%');
  assert.deepEqual(await page.locator('.metric strong').allTextContents(),['0','1','9']);
  await page.reload(); await page.locator('.result-page').waitFor();
  assert.equal(await page.locator('.score').textContent(),'0.0%');
  for (const width of [360,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`result overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(root,'.tmp','step2-result-mobile.png'),fullPage:true});
  logs.push('PASS: 非法输入不计分；跳过；退出确认/取消；首次答错即使订正正确仍记错；成绩刷新可查看');
  logs.push('PASS: 成绩页在 360/390/768/1440px 均无横向溢出');
  await start();
  for (let i=0;i<10;i++) {
    const session=await active();
    await page.locator('#quiz-answer').fill(session.paper.questions[session.cursor].answer);
    await page.locator('#quiz-answer').press('Enter');
    if(i<9) await page.getByText(`第 ${i+2} / 共 10 题`,{exact:true}).waitFor();
  }
  await page.locator('.result-page').waitFor();
  assert.equal(await page.locator('.score').textContent(),'100.0%');
  await page.getByText('全部答对，真棒！',{exact:true}).waitFor();
  logs.push('PASS: 完整作答 10 题→100.0% 与优秀等级，自动结算');
  await start();
  await page.evaluate(() => {
    const key=`km:quiz:active:${JSON.parse(localStorage.getItem('km:active'))}`;
    const s=JSON.parse(localStorage.getItem(key));
    s.startAt=Date.now()-61000; s.questionAt=s.startAt; s.savedAt=Date.now(); s.limitMs=60000;
    localStorage.setItem(key,JSON.stringify(s));
  });
  await page.reload(); await page.getByRole('button',{name:'继续练习',exact:true}).click();
  await page.getByText('时间到，来看看成绩',{exact:true}).waitFor();
  assert.deepEqual(await page.locator('.metric strong').allTextContents(),['0','0','10']);
  logs.push('PASS: 恢复已超时会话→自动结算，剩余题记未作答');
  const isolated=await browser.newContext();
  await isolated.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('disabled'); }; });
  const fallback=await isolated.newPage();
  await fallback.goto(base+'/#/practice');
  await fallback.getByRole('button',{name:'开始出题 · 30 道',exact:true}).click();
  await fallback.getByRole('button',{name:'开始答题',exact:true}).click();
  await fallback.locator('#quiz-answer').fill('1');
  await fallback.getByRole('button',{name:'提交答案',exact:true}).click();
  await fallback.getByText('进度暂存在当前页面，关闭或刷新可能丢失。',{exact:true}).waitFor();
  logs.push('PASS: 存储不可用时仍能出题与答题，并明确提示无法恢复');
  assert.deepEqual(errors,[]);
  logs.push('PASS: 正常流程无页面 JavaScript 异常');
  // 旧引擎冒烟测试继续运行，防止接入答题时破坏出题功能。
  await page.goto(base+'/tests/smoke.html');
  await page.waitForFunction(()=>document.getElementById('out').textContent.includes('DONE'));
  const smoke=await page.locator('#out').textContent();
  assert.ok(smoke.includes('7200 题，异常 0')); assert.ok(smoke.includes('重复的份数 = 0'));
  logs.push('PASS: 原出题引擎回归 7200 题 0 异常，60 份卷子 0 重复');
  console.log(logs.join('\n'));
  await fs.mkdir(path.join(root,'.tmp'),{recursive:true});
  await fs.writeFile(path.join(root,'.tmp','step2-browser-results.json'),JSON.stringify({executedAt:new Date().toISOString(),checks:logs},null,2));
})().catch(e=>{ console.error(e);process.exitCode=1; }).finally(async()=>{
  if(browser) await browser.close(); server.close();
});
