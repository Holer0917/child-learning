const { toSettings } = require('./practice-navigation.cjs');
// 先在项目根目录运行 python -m http.server 8765 --bind 127.0.0.1。
// 只使用独立测试浏览器；示例成绩不会进入用户日常浏览器的数据。
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/';
const log=[];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'#/home');
  assert.equal(await page.locator('.start-entry').count(),3);
  await page.locator('.entry-history').click();
  await page.getByText('第一份成绩，等你来创造',{exact:true}).waitFor();
  await page.getByRole('link',{name:'开始出题练习',exact:true}).click();
  await toSettings(page);
  await page.getByRole('button',{name:'开始出题 · 30 道',exact:true}).waitFor();
  log.push('PASS: 开始页三个入口，历史空态可进入出题台');
  await page.evaluate(async()=>{
   const {generatePaper}=await import('/src/domain/generator.js');
   const {settleSession,judgeAnswer}=await import('/src/domain/grader.js');
   const pid=JSON.parse(localStorage.getItem('km:active'));const rows=[];
   for(let i=0;i<45;i++) {
    const paper=generatePaper({kpIds:['G1-01'],count:10,types:['horizontal'],seed:i});
    const attempts={};const right=i===0?9:i===44?3:8;
    paper.questions.forEach((q,n)=>{const userAnswer=n<right?q.answer:'999999';attempts[q.id]={userAnswer,...judgeAnswer(q,userAnswer),elapsedMs:1000,first:true};});
    rows.push({...settleSession(paper,attempts,10000),id:'history-'+i,profileId:pid,finishedAt:Date.now()-(i+1)*3600000,compressed:false});
   }
   rows.push({...rows[0],id:'archived',finishedAt:Date.now()-60*86400000,compressed:true,paper:null,detail:[],wrongList:[],kpCount:{'G1-01':10}});
   localStorage.setItem('km:sessions:'+pid,JSON.stringify(rows.reverse()));
  });
  await page.goto(base+'#/history');
  await page.locator('.history-record').first().waitFor();
  assert.equal(await page.locator('.history-record').count(),10);
  const first = page.locator('.history-record').first();
  assert.equal(await first.evaluate(node=>node.tagName),'ARTICLE');
  assert.equal(await first.locator('a').count(),1);
  assert.ok((await first.locator('.record-detail').getAttribute('href')).includes('history-0'));
  assert.equal(await first.locator('.record-detail').textContent(),'查看详情');
  await first.locator('.record-counts').click();
  assert.equal(new URL(page.url()).hash,'#/history');
  log.push('PASS: 记录文字为普通卡片，点击不跳转；每条仅一个查看详情链接');
  const waitCount=async n=>page.waitForFunction(count=>document.querySelectorAll('.history-record').length===count,n);
  await page.getByRole('link',{name:'最近 5 次',exact:true}).click();await waitCount(5);
  await page.reload();await page.locator('.history-page').waitFor();assert.equal(await page.locator('.history-record').count(),5);
  await page.getByRole('link',{name:'最近 30 次',exact:true}).click();await waitCount(30);
  await page.getByRole('link',{name:'全部记录',exact:true}).click();await waitCount(20);
  await page.getByRole('button',{name:'再看更早的记录',exact:true}).click();await waitCount(40);
  await page.getByRole('button',{name:'再看更早的记录',exact:true}).click();await waitCount(46);
  log.push('PASS: 原记录倒序显示；最近 5/10/30 次、全部与分批加载；刷新保留显示范围');
  await page.locator('a[href="#/result?id=history-44"]').focus();
  await page.keyboard.press('Enter');await page.locator('.result-page').waitFor();
  assert.equal(await page.locator('.score').textContent(),'30.0%');
  await page.reload();await page.locator('.result-page').waitFor();assert.equal(await page.locator('.score').textContent(),'30.0%');
  assert.equal(await page.locator('.review-list > li').count(),7);
  await page.goto(base+'#/result?id=archived');await page.locator('.summary-notice').waitFor();
  assert.ok((await page.locator('.summary-notice').textContent()).includes('明细已压缩'));
  await page.goto(base+'#/result?id=does-not-exist');await page.getByText('找不到这条练习记录',{exact:true}).waitFor();
  log.push('PASS: 旧成绩按 id 打开且刷新不串到最新成绩；错题可回看；摘要和记录不存在有明确提示');
  await page.goto(base+'#/mistakes');await page.getByRole('heading',{name:'错题本',exact:true}).waitFor();
  assert.ok(await page.locator('.mistake-item').count()>0,'旧完整成绩可回补到已开放的错题本');
  await page.getByRole('link',{name:'成绩历史',exact:true}).click();await page.locator('.history-page').waitFor();
  log.push('PASS: 错题本已开放、旧完整成绩可回补，可从主导航返回历史页');
  for(const width of [360,390,768,1024,1440]) {
   await page.setViewportSize({width,height:900});
   for(const route of ['home','practice','history?limit=5','mistakes','result?id=history-44']) {
    await page.goto(base+'#/'+route);await page.locator('#app h1').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} overflow at ${width}`);
    if(route.startsWith('history')) {
     const card=page.locator('.history-record').first();
     await card.locator('time').click();
     assert.ok(new URL(page.url()).hash.startsWith('#/history'));
     const link=card.locator('.record-detail');
     assert.equal(await link.isVisible(),true);
     assert.ok((await link.boundingBox()).height>=44);
    }
   }
  }
  log.push('PASS: 开始页、出题台、成绩历史、历史详情、错题本入口在 360/390/768/1024/1440px 无横向溢出');
  await page.goto(base+'#/practice');await toSettings(page);await page.getByRole('button',{name:'开始出题 · 30 道',exact:true}).click();
  await page.getByRole('button',{name:'开始答题',exact:true}).click();await page.locator('#quiz-answer').waitFor();
  await page.locator('#quiz-answer').fill('999999');await page.getByRole('button',{name:'提交答案',exact:true}).click();
  // 首题可能为比较题，使用实际标准答案可涵盖任意默认知识点。
  if(await page.locator('#quiz-answer').isEnabled()) {
   const answer=await page.evaluate(()=>{const pid=JSON.parse(localStorage.getItem('km:active'));return JSON.parse(localStorage.getItem('km:quiz:active:'+pid)).paper.questions[0].answer;});
   await page.locator('#quiz-answer').fill(answer);await page.getByRole('button',{name:'提交答案',exact:true}).click();
  }
  await page.getByRole('button',{name:'退出练习',exact:true}).click();await page.getByRole('button',{name:'确认结束',exact:true}).click();await page.locator('.result-page').waitFor();
  await page.getByRole('link',{name:'返回成绩历史',exact:true}).click();await page.locator('.history-page').waitFor();
  assert.equal(await page.locator('.history-stat strong').first().textContent(),'47 次');
  log.push('PASS: 正常答题结算后新增历史记录，可从成绩详情返回历史列表');
  await fs.mkdir('.tmp',{recursive:true});
  await page.setViewportSize({width:390,height:844});await page.goto(base+'#/home');await page.screenshot({path:'.tmp/history-home-mobile.png',fullPage:true});
  await page.goto(base+'#/history?limit=5');await page.screenshot({path:'.tmp/history-list-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.tmp/history-list-desktop.png',fullPage:true});
  await page.goto(base+'#/home');await page.screenshot({path:'.tmp/history-home-desktop.png',fullPage:true});
  await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(220);await page.goto(base+'#/history?limit=5');await page.screenshot({path:'.tmp/history-dark.png',fullPage:true});
  assert.deepEqual(errors,[]);log.push('PASS: 无页面 JavaScript 异常');
  console.log(log.join('\n'));await fs.writeFile('.tmp/history-checks.json',JSON.stringify({executedAt:new Date().toISOString(),checks:log},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
