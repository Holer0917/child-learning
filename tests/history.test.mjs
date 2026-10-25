import assert from 'node:assert/strict';
import { test } from 'node:test';

const data = new Map();
globalThis.localStorage = { getItem: k => data.get(k) ?? null,
  setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
const {write,read}=await import('../src/core/storage.js');
const {ensureProfile,getActiveProfile}=await import('../src/domain/profile.js');
const {listHistory,getHistoryRecord,summarizeHistory}=await import('../src/domain/history.js');
ensureProfile(); const pid=getActiveProfile().id;
const record=(id,at,extra={})=>({id,profileId:pid,finishedAt:at,total:10,correct:8,wrong:1,skipped:1,
  elapsedMs:30000,avgMs:1000,paper:{questions:Array.from({length:10},()=>({kpId:'G1-01',text:'2 + 3 = ___'}))},...extra});

test('读取原有 sessions 键，按时间倒序；不改写或清空历史',()=>{
  write(`sessions:${pid}`,[record('a',1000),record('b',3000),record('c',2000)]);
  const before=localStorage.getItem(`km:sessions:${pid}`);
  assert.deepEqual(listHistory().map(r=>r.id),['b','c','a']);
  assert.equal(getHistoryRecord('a').accuracy,80);
  assert.equal(localStorage.getItem(`km:sessions:${pid}`),before);
});
test('查历史详情按 id 定位，不回退到最近一次；不同档案隔离',()=>{
  assert.equal(getHistoryRecord('c').finishedAt,2000);
  assert.equal(getHistoryRecord('missing'),null);
  write('sessions:other',[record('other',5000,{profileId:'other'})]);
  assert.equal(getHistoryRecord('other'),null);
});
test('损坏单条、重复 id、跨档案记录和异常日期不导致整页失败',()=>{
  const a=record('a',1000);
  write(`sessions:${pid}`,[a,null,a,record('bad',2000,{total:9}),record('cross',3000,{profileId:'other'}),record('date',1e20)]);
  assert.deepEqual(listHistory().map(r=>r.id),['a']);
  assert.equal(read(`sessions:${pid}`).length,6);
});
test('摘要可查看成绩；缺失明细时明确识别为摘要',()=>{
  write(`sessions:${pid}`,[record('summary',5000,{compressed:true,paper:null,kpCount:{'G1-01':10}}),record('no-paper',2000,{paper:null})]);
  assert.equal(getHistoryRecord('summary').compressed,true);
  assert.equal(getHistoryRecord('summary').grade.label,'良好');
  assert.equal(getHistoryRecord('no-paper').compressed,true);
});
test('统计按累计题量计算，空记录不虚构正确率',()=>{
  const list=[record('a',1000),record('b',2000,{total:5,correct:5,wrong:0,skipped:0})];
  assert.deepEqual(summarizeHistory(list),{count:2,total:15,accuracy:86.7});
  assert.deepEqual(summarizeHistory([]),{count:0,total:0,accuracy:null});
  write(`sessions:${pid}`,{invalid:true}); assert.deepEqual(listHistory(),[]);
});
