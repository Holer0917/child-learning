const {chromium}=require('playwright');
const {toSettings}=require('./practice-navigation.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer(async(req,res)=>{
 try{
  const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
  if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain'}).end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const base=process.env.PREVIEW_SITE||`http://127.0.0.1:${server.address().port}/`,checks=[];
 try{
  for(const width of [360,390,1440]){
   const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'#/practice');await toSettings(page);
   const text=await page.locator('#app').innerText();
   for(const fragment of ['离开输入框或按回车确认','小数、空值和非数字','1 星题至少占 70%','仅使用已选知识点支持的题型','本次不出题的知识点'])assert.equal(text.includes(fragment),false);
   await page.locator('#custom-count').fill('37');await page.locator('#limit-minutes').selectOption('2');
   await page.locator('#generate-paper').click();await page.locator('.practice-preview').waitFor();
   assert.equal(new URL(page.url()).hash,'#/preview');
   assert.equal(await page.locator('#custom-count, #generate-paper, .practice-steps').count(),0);
   assert.equal(await page.locator('.question-item').count(),37);
   assert.ok(await page.locator('#preview-back').isVisible());
   assert.ok((await page.locator('#app h1').boundingBox()).y<300);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await fs.mkdir(path.join(root,'.tmp'),{recursive:true});
   if(!process.env.PREVIEW_SITE)await page.screenshot({path:path.join(root,'.tmp',`practice-preview-${width}.png`),fullPage:true});
   const paper=await page.locator('.question-item').allTextContents();
   await page.goBack();await page.locator('#custom-count').waitFor();
   assert.equal(await page.locator('#custom-count').inputValue(),'37');
   assert.equal(await page.locator('#limit-minutes').inputValue(),'2');
   await page.goForward();await page.locator('.practice-preview').waitFor();
   assert.deepEqual(await page.locator('.question-item').allTextContents(),paper);
   await page.locator('#preview-back').click();await page.locator('#custom-count').waitFor();
   assert.equal(await page.locator('.paper-block').count(),0);
   await page.locator('#reopen-preview').click();await page.locator('.practice-preview').waitFor();
   assert.deepEqual(await page.locator('.question-item').allTextContents(),paper);
   await page.reload();await page.getByText('预览已失效，请重新出题。',{exact:true}).waitFor();
   await page.getByRole('link',{name:'返回出题练习',exact:true}).click();await toSettings(page);
   await page.locator('#custom-count').fill('10');await page.locator('#generate-paper').click();await page.locator('.practice-preview').waitFor();
   await page.evaluate(async()=>{
    const {generatePaper}=await import(new URL('src/domain/generator.js',location.href).href);
    const {createSession}=await import(new URL('src/app/quizSession.js',location.href).href);
    createSession(generatePaper({kpIds:['G1-01'],count:5,types:['horizontal'],seed:1}));
   });
   await page.getByRole('button',{name:'开始答题',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'请先继续或放弃上次练习'}).waitFor();
   await page.locator('#preview-back').click();await page.locator('#reopen-preview').click();await page.locator('.practice-preview').waitFor();
   page.once('dialog',d=>d.accept());
   await page.getByRole('button',{name:'放弃上次练习',exact:true}).click();
   assert.equal(new URL(page.url()).hash,'#/preview');
   assert.equal(await page.locator('.practice-preview').count(),1);
   assert.equal(await page.locator('#paper-error, #custom-count').count(),0);
   await page.getByRole('button',{name:'开始答题',exact:true}).click();await page.locator('#quiz-answer').waitFor();
   assert.deepEqual(errors,[]);checks.push({width,passed:true});await context.close();
  }
  await fs.mkdir(path.join(root,'.tmp'),{recursive:true});
  const message='PASS: separate preview, concise settings, browser back/forward, preserved parameters, reload recovery, start quiz at 360/390/1440px';
  await fs.writeFile(path.join(root,'.tmp/practice-preview-flow-results.json'),JSON.stringify({executedAt:new Date().toISOString(),passed:true,site:base,checks:[message],layouts:checks},null,2));
  console.log(message);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
