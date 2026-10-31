const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../../../..'), out = path.join(root, 'docs/04-测试/evidence/Knowledge-picker-20261031');
const publicMode = process.env.PICKER_PUBLIC === '1';
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://local'), file = path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
    let data = await fs.readFile(file);
    if (file.endsWith('.html')) data=Buffer.from(data.toString().replace('</head>','<meta name="kidsmath-development" content="true"></head>'));
    res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.png':'image/png'})[path.extname(file)]||'text/plain','Cache-Control':'no-store'}).end(data);
  } catch {res.writeHead(404).end();}
});
let browser;
(async()=>{
  await fs.mkdir(out,{recursive:true}); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const sites=publicMode?[{name:'formal',base:'https://holer0917.github.io/child-learning/'},{name:'preview',base:'https://holer0917.github.io/child-learning-b10-preview/'}]:[{name:'local',base:`http://127.0.0.1:${server.address().port}/`}];
  const results=[],errors=[];
  for (const site of sites) for (const [width,height] of [[360,640],[390,844],[568,320],[1440,900]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(site.base+'?picker=3#/practice');await page.locator('#choose-kp').waitFor();
    assert.equal(await page.locator('.kp-item').count(),0);
    await page.locator('#custom-count').fill('10');await page.locator('#generate-paper').click();await page.locator('.paper-block').waitFor();
    const paper=await page.locator('.question-item').allTextContents();
    await page.locator('#choose-kp').click();const modal=page.locator('.kp-dialog');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'kp-dialog-title');
    const metrics=await modal.evaluate(d=>{
      const r=d.getBoundingClientRect(),f=d.querySelector('.kp-dialog-footer').getBoundingClientRect(),b=d.querySelector('#kp-confirm').getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,dialog:{x:r.x,y:r.y,width:r.width,height:r.height},footer:{top:f.top,bottom:f.bottom},button:{width:b.width,height:b.height},bodyOverflow:getComputedStyle(d.querySelector('.kp-dialog-body')).overflowY,horizontal:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(metrics.horizontal,false);assert.ok(metrics.footer.bottom<=height+1 && metrics.footer.top>=0);
    assert.ok(metrics.button.width>=44 && metrics.button.height>=44);assert.equal(metrics.bodyOverflow,'auto');
    if(width<=700){assert.ok(Math.abs(metrics.dialog.width-width)<=1);assert.ok(Math.abs(metrics.dialog.height-height)<=1);}
    for(let i=0;i<22;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.kp-dialog')),true);}
    await modal.getByRole('button',{name:'三年级',exact:true}).click();await modal.locator('#kp-select-none').click();
    await modal.locator('#kp-cancel').click();await modal.waitFor({state:'detached'});
    assert.equal(await page.locator('#grade-1').getAttribute('aria-pressed'),'true');assert.deepEqual(await page.locator('.question-item').allTextContents(),paper);
    await page.locator('#choose-kp').click();await page.locator('#kp-search').fill('进位');await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
    assert.deepEqual(await page.locator('.question-item').allTextContents(),paper);
    await page.locator('#choose-kp').click();await page.locator('#kp-confirm').click();await modal.waitFor({state:'detached'});
    assert.deepEqual(await page.locator('.question-item').allTextContents(),paper);
    await page.locator('#choose-kp').click();await modal.locator('#kp-select-none').click();await modal.locator('#kp-G1-03').check();
    if(width===390||width===1440) await page.screenshot({path:path.join(out,`${site.name}-picker-${width}.png`)});
    await modal.locator('#kp-confirm').click();await modal.waitFor({state:'detached'});
    assert.equal(await page.locator('.paper-block').count(),0);assert.ok((await page.locator('#choose-kp').textContent()).includes('20 以内进位加法'));
    assert.equal(await page.locator('#custom-count').inputValue(),'10');await page.locator('#generate-paper').click();
    assert.equal(await page.locator('.question-item').count(),10);
    assert.equal(await page.locator('.question-item').evaluateAll(ns=>ns.every(n=>n.dataset.kpId==='G1-03')),true);
    await page.locator('#choose-kp').click();await modal.getByRole('button',{name:'三年级',exact:true}).click();await modal.locator('#kp-select-none').click();await modal.locator('#kp-G3-07').check();
    await modal.locator('#kp-confirm').click();await modal.waitFor({state:'detached'});assert.equal(await page.locator('#grade-3').getAttribute('aria-pressed'),'true');
    if(width===390||width===1440){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`${site.name}-practice-${width}.png`),fullPage:true});}
    await page.locator('#choose-kp').click();await page.goto(site.base+'#/home');assert.equal(await page.locator('.kp-dialog').count(),0);assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
    results.push({site:site.name,width,height,metrics,checks:['compact entry','footer visible','focus trap','cancel/Escape preserves paper','unchanged selection preserves paper','confirmed selection invalidates paper and controls generated questions','draft grade commit','route cleanup']});
    await context.close();
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,publicMode?'public-picker-checks.json':'local-picker-checks.json'),JSON.stringify({executedAt:new Date().toISOString(),passed:true,results,errors},null,2)+'\n');
  console.log(JSON.stringify({passed:true,publicMode,layouts:results.length,checksPerLayout:8}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
