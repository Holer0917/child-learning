const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const checks=[];
 try {
  for(const width of [390,1440]) {
   const context=await browser.newContext({viewport:{width,height:844}});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto((process.env.STATS_SITE||'http://127.0.0.1:8765/')+'#/stats');
   await page.locator('.stats-page').waitFor();
   async function check(){
    const back=page.getByRole('link',{name:'返回错题本',exact:true});
    assert.equal(await back.count(),1);
    assert.ok(await back.evaluate(n=>!!(n.compareDocumentPosition(document.querySelector('.stats-page .card')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    const box=await back.boundingBox();assert.ok(box.y>=0 && box.y+box.height<=844);
    assert.ok(box.height>=44);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await check();await page.locator('#range-7').click();await check();
   await page.getByRole('link',{name:'返回错题本',exact:true}).focus();
   await page.keyboard.press('Enter');await page.getByRole('heading',{name:'错题本',exact:true}).waitFor();
   assert.equal(new URL(page.url()).hash,'#/mistakes');
   assert.deepEqual(errors,[]);checks.push({width,passed:true});await context.close();
  }
  await fs.writeFile('.tmp/stats-back-checks.json',JSON.stringify({passed:true,site:process.env.STATS_SITE||'local',checks},null,2));
  console.log('PASS: mobile/desktop top return link, range rerender, keyboard navigation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
