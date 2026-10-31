const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
 try{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain'}).end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const base=process.env.NAV_SITE||`http://127.0.0.1:${server.address().port}/`,checks=[];
 try{
  for(const width of [360,390,1440]){
   const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
   await page.goto(base+'#/home');await page.locator('.start-page').waitFor();
   assert.equal(await page.locator('.header-nav').isVisible(),false);
   assert.equal(await page.locator('.header-nav a[href="#/home"]').count(),0);
   for(const route of ['practice','history','mistakes','stats','profiles','settings']){
    await page.goto(base+'#/'+route);await page.locator('#app h1').waitFor();
    assert.equal(await page.locator('.header-nav').isVisible(),true);
    assert.deepEqual(await page.locator('.nav-link').evaluateAll(ns=>ns.map(n=>n.hash)),['#/practice','#/history','#/mistakes','#/stats','#/profiles','#/settings']);
    assert.equal(await page.locator('.nav-link[aria-current]').getAttribute('href'),'#/'+route);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await page.locator('.brand').click();await page.locator('.start-page').waitFor();
   assert.equal(await page.locator('.header-nav').isVisible(),false);
   await page.locator('.entry-history').click();await page.locator('.history-page').waitFor();
   assert.equal(await page.locator('.header-nav').isVisible(),true);
   await page.goBack();await page.locator('.start-page').waitFor();
   assert.equal(await page.locator('.header-nav').isVisible(),false);
   await page.reload();await page.locator('.start-page').waitFor();
   assert.equal(await page.locator('.header-nav').isVisible(),false);
   if(!process.env.NAV_SITE)await page.screenshot({path:path.join(root,'.tmp',`start-navigation-${width}.png`),fullPage:true});
   checks.push({width,passed:true});await context.close();
  }
  await fs.writeFile(path.join(root,'.tmp/start-navigation-results.json'),JSON.stringify({passed:true,site:base,checks},null,2));
  console.log('PASS: start without navigation, six feature entries, brand return, back/reload at 360/390/1440px');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
