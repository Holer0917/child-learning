// Node >=22；不依赖第三方包。运行：node --test tests/quiz-session.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

const data = new Map();
let blocked = false;
globalThis.localStorage = {
  getItem: k => data.get(k) ?? null,
  setItem(k, v) { if (blocked) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); data.set(k, String(v)); },
  removeItem: k => data.delete(k)
};
const storage = await import('../src/core/storage.js');
const profile = await import('../src/domain/profile.js');
const app = await import('../src/app/quizSession.js');
const grader = await import('../src/domain/grader.js');
const { normalizeAnswer } = await import('../src/utils/format.js');
const { SYLLABUS } = await import('../src/domain/syllabus.js');
const { generatePaper } = await import('../src/domain/generator.js');
const actualNow = Date.now;
let now = 1792627200000;
Date.now = () => now;
profile.ensureProfile();
const pid = profile.getActiveProfile().id;
const paper = () => ({ id: 'paper-test', createdAt: now, questions: Array.from({length: 5}, (_,i) => ({
  id: `q${i+1}`, kpId: 'G1-01', kind: 'int', type: 'horizontal', op: 'add',
  text: '2 + 3 = ___', answer: '5', params: { a:2,b:3 }, difficulty: 1
})) });
const fresh = async () => import(`../src/app/quizSession.js?cold=${Math.random()}`);

test('首次提交、重试不覆盖成绩，跳过与剩余题按实际题量结算', () => {
  const s = app.createSession(paper());
  now += 1000;
  assert.equal(app.recordAttempt('05.0').correct, true);
  assert.throws(() => app.recordAttempt('5'), /已经提交/);
  app.advance();
  now += 2000;
  assert.equal(app.recordAttempt('4').correct, false);
  assert.equal(app.recordAttempt('5', { retry:true }).correct, true);
  assert.throws(() => app.recordAttempt('5', { retry:true }), /重试/);
  app.advance(); app.recordAttempt('', {skip:true}); app.advance();
  const r = app.finishSession('exit');
  assert.equal(r.id, s.id);
  assert.deepEqual([r.correct,r.wrong,r.skipped,r.answered], [1,1,3,2]);
  assert.equal(r.accuracy, 20);
  assert.equal(r.avgMs, 1500);
  assert.equal(r.wrongList[0].userAnswer,'4');
  assert.equal(app.finishSession().id, r.id);
  assert.equal(storage.read(`sessions:${pid}`,[]).length,1);
  assert.equal(storage.read(`quiz:active:${pid}`,null),null);
});
test('刷新通过磁盘恢复题号、输入草稿和首次提交结果', async () => {
  app.createSession(paper()); app.recordAttempt('5'); app.advance(); app.saveDraft('12');
  const cold = await fresh(), s = cold.resumeSession();
  assert.equal(s.cursor, 1); assert.equal(s.draft, '12'); assert.equal(s.attempts.q1.correct,true);
  app.discardSession();
});
test('非法/过期/跨档案恢复点被隔离；恢复时重算判分', async () => {
  app.createSession(paper()); app.recordAttempt('4');
  const key = `quiz:active:${pid}`, s=storage.read(key);
  s.attempts.q1.correct=true; storage.write(key,s);
  assert.equal((await fresh()).resumeSession().attempts.q1.correct,false);
  for (const mutate of [v=>v.cursor=100,v=>v.profileId='other',v=>v.savedAt=now-86400001,
    v=>v.attempts.unknown={userAnswer:'5',correct:true,skipped:false,elapsedMs:0,first:true}]) {
    const bad=JSON.parse(JSON.stringify(s)); mutate(bad); storage.write(key,bad);
    assert.equal((await fresh()).resumeSession(),null);
    assert.equal(storage.read(key,null),null);
  }
  app.discardSession();
});
test('倒计时包含后台/刷新时间，到期禁止继续计分', async () => {
  app.createSession(paper(),{limitMs:60000}); now+=61000;
  const cold=await fresh(), s=cold.resumeSession();
  assert.equal(cold.expired(s),true);
  assert.deepEqual(cold.recordAttempt('5'),{timedOut:true});
  const r=cold.finishSession('timeout'); assert.equal(r.skipped,5); assert.equal(r.avgMs,null);
  app.discardSession();
});
test('退出零作答不新增记录；空答案是跳过', () => {
  const n=storage.read(`sessions:${pid}`,[]).length;
  app.createSession(paper()); assert.equal(app.finishSession('exit'),null);
  assert.equal(storage.read(`sessions:${pid}`,[]).length,n);
  app.createSession(paper()); assert.equal(app.recordAttempt('  ').skipped,true); app.discardSession();
});
test('分数、小数、比较、有余数及非法格式输入', () => {
  for (const [kind,answer,input] of [['fraction','1/2','2/4'],['decimal','0.5','.50'],['sign','>','＞'],['int','9余2','9 余 2']]) {
    const p=paper(); p.questions[0]={...p.questions[0],kind,answer};
    app.createSession(p); assert.equal(app.recordAttempt(input).correct,true); app.discardSession();
  }
  app.createSession(paper());
  for(const value of ['abc','1e3','<script>','1/0']) assert.throws(()=>app.recordAttempt(value));
  assert.deepEqual(app.resumeSession().attempts,{}); app.discardSession();
  assert.equal(normalizeAnswer('9 余 2'),'9余2');
});
test('24 个知识点的生成结果均能进入会话并接受标准答案', () => {
  for (const kp of SYLLABUS) {
    const p=generatePaper({kpIds:[kp.id],count:5,types:kp.types,seed:42});
    app.createSession(p);
    assert.equal(app.recordAttempt(p.questions[0].answer).correct,true,kp.id);
    app.discardSession();
  }
});
test('存储满后可继续答题，保留旧记录和磁盘恢复点', () => {
  const n=storage.read(`sessions:${pid}`,[]).length;
  app.createSession(paper()); blocked=true;
  app.recordAttempt('5'); assert.equal(app.savedDurably(),false);
  const r=app.finishSession('exit');
  assert.equal(r.correct,1); assert.equal(r.saved,false);
  assert.equal(storage.read(`sessions:${pid}`,[]).length,n);
  assert.ok(storage.read(`quiz:active:${pid}`,null));
  blocked=false; app.discardSession();
});
test('501 条完整记录后压缩最早明细并保留统计', () => {
  const r=grader.settleSession(paper(),{},1000);
  storage.write(`sessions:${pid}`,Array.from({length:500},(_,i)=>({...r,id:`old-${i}`})));
  app.createSession(paper()); app.recordAttempt('5'); app.finishSession('exit');
  const records=storage.read(`sessions:${pid}`,[]);
  assert.equal(records.length,501); assert.equal(records[499].compressed,undefined);
  assert.equal(records[500].compressed,true); assert.equal(records[500].paper,null);
  assert.deepEqual(records[500].kpCount,{'G1-01':5});
});
test.after(() => { Date.now=actualNow; });
