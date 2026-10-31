/** Current explicit-profile-entry release checks; isolated Edge contexts. */
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const output=path.resolve(root,process.env.RELEASE_CHECK_OUTPUT||'docs/04-测试/evidence/Preview-promotion-20261031');
fs.mkdirSync(output,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex');
const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
const runtime=['index.html','manifest.webmanifest','sw.js','assets/css/base.css',...walk('src')].sort();
const sources=[...runtime,'authoring/main.js','authoring/profiles.js','authoring/practice.js','scripts/build-entry.py','scripts/build-practice.py','tests/profile-entry.cjs','tests/stats-fold.cjs'];
const before=sources.map(file=>({file,sha256:sha(fs.readFileSync(path.join(root,file)))}));
const unit=['generator-options','paper-stats','paper-edit','quiz-session','history','mistakes-stats','profiles-backup'].map(x=>'tests/'+x+'.test.mjs');
const tasks=[['unit',['--test',...unit]],['profile-entry',['tests/profile-entry.cjs'],'profile-entry-results.json'],['stats-fold',['tests/stats-fold.cjs'],'stats-fold-results.json']];
const results=[];
for(const [id,args,resultFile] of tasks){
 const start=Date.now(),p=spawnSync(process.execPath,args,{cwd:root,env:process.env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:5*1024*1024});
 fs.writeFileSync(path.join(output,id+'.log'),(p.stdout||'')+(p.stderr||''));
 const row={id,passed:p.status===0,durationMs:Date.now()-start,exitCode:p.status};
 if(id==='unit'){row.tests=Number((p.stdout||'').match(/(?:ℹ|#) tests (\d+)/)?.[1]);row.pass=Number((p.stdout||'').match(/(?:ℹ|#) pass (\d+)/)?.[1]);}
 if(resultFile&&row.passed){const data=fs.readFileSync(path.join(root,'.tmp',resultFile));const detail=JSON.parse(data);row.passed=detail.passed===true&&Date.parse(detail.executedAt)>=start;row.cases=detail.checks.length;fs.writeFileSync(path.join(output,resultFile),data);}
 results.push(row);console.log((row.passed?'PASS ':'FAIL ')+id);
}
const unchanged=before.every(row=>sha(fs.readFileSync(path.join(root,row.file)))===row.sha256);
const runtimeBytes=runtime.filter(f=>!f.endsWith('.png')).reduce((sum,f)=>sum+fs.statSync(path.join(root,f)).size,0);
const summary={executedAt:new Date().toISOString(),passed:results.every(r=>r.passed)&&unchanged&&runtimeBytes<=300000,results,inputsUnchanged:unchanged,inputs:before,runtimeBytes,limit:300000,scope:'77 domain tests plus current profile-entry/offline and collapsible-stats browser scenarios; not the historical 140-group GUI suite or a physical-device acceptance'};
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary.results));console.log('Runtime bytes: '+runtimeBytes);
if(!summary.passed)process.exitCode=1;
