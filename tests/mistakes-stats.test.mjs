import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
const data = new Map();
let failKey = null;
globalThis.localStorage = {
  getItem: k => data.get(k) ?? null,
  setItem(k, v) { if (k === failKey) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); data.set(k, String(v)); },
  removeItem: k => data.delete(k), key: i => [...data.keys()][i] ?? null,
  get length() { return data.size; }
};
const storage = await import('../src/core/storage.js');
const profile = await import('../src/domain/profile.js');
const quiz = await import('../src/app/quizSession.js');
const m = await import('../src/domain/mistakes.js');
const stats = await import('../src/domain/stats.js');
const { generatePaper, dedupeKey } = await import('../src/domain/generator.js');
const { buildVariantPaper } = await import('../src/domain/variants.js');
const { settleSession } = await import('../src/domain/grader.js');
const { SYLLABUS } = await import('../src/domain/syllabus.js');
const { dateStr } = await import('../src/utils/date.js');
const clone = v => JSON.parse(JSON.stringify(v));
let pid;
beforeEach(() => { failKey = null; data.clear(); storage.__resetForTest(); pid = profile.ensureProfile().id; });
const paper = (count = 5, seed = 1, kp = 'G2-01') => generatePaper({ kpIds: [kp], count, seed, types: ['horizontal'] });
const result = (p, id = 'source', answer = '-999') => ({ ...settleSession(p, Object.fromEntries(
  p.questions.map(q => [q.id, { userAnswer: answer, correct: false, skipped: false, elapsedMs: 100 }]))),
  id, profileId: pid });
const single = q => ({ id: 'single', questions: [{ ...q, id: 'q1' }] });
const summary = (id, correct, total = 100, skipped = 0, kp = 'G1-01', finishedAt = Date.now()) => ({
  id, profileId: pid, finishedAt, total, correct, wrong: total - correct - skipped, skipped,
  accuracy: correct / total * 100, elapsedMs: 1000, compressed: true,
  kpAnswered: { [kp]: total - skipped }, kpCorrect: { [kp]: correct }
});

test('首次错题自动归档；跳过不入库，订正不覆盖首次错题及成绩', () => {
  const s = quiz.createSession(paper());
  quiz.recordAttempt('-999'); quiz.recordAttempt(s.paper.questions[0].answer, { retry: true }); quiz.advance();
  quiz.recordAttempt('', { skip: true }); quiz.advance();
  for (const q of s.paper.questions.slice(2)) { quiz.recordAttempt(q.answer); quiz.advance(); }
  const r = quiz.getLastResult();
  assert.equal(r.correct, 3); assert.equal(r.skipped, 1); assert.equal(r.mistakesSaved, true);
  assert.equal(m.readStore(pid).items.length, 1);
  assert.equal(m.readStore(pid).items[0].userAnswer, '-999');
});
test('1题重练答对自动攻克，刷新恢复保留模式与错题来源', () => {
  m.archiveSession(result(single(paper().questions[0])));
  const item = m.readStore(pid).items[0];
  const retry = m.buildRetryPaper(pid, [item.id]);
  assert.equal(retry.ok, true);
  const s = quiz.createSession(retry.paper);
  assert.equal(s.mode, 'retry'); assert.equal(quiz.resumeSession().paper.sourceMistakeIds[0], item.id);
  quiz.recordAttempt(s.paper.questions[0].answer); quiz.advance();
  assert.equal(m.readStore(pid).items[0].mastered, true);
  assert.equal(m.archiveSession(quiz.getLastResult()).duplicate, true);
  assert.equal(m.readStore(pid).items[0].wrongCount, 1);
});
test('重练答错只加一次，跳过不攻克、不增加错误次数', () => {
  m.archiveSession(result(single(paper().questions[0])));
  const item = m.readStore(pid).items[0];
  quiz.createSession(m.buildRetryPaper(pid, [item.id]).paper);
  quiz.recordAttempt('-998'); quiz.advance();
  assert.equal(m.readStore(pid).items[0].wrongCount, 2);
  quiz.finishSession(); assert.equal(m.readStore(pid).items[0].wrongCount, 2);
  quiz.createSession(m.buildRetryPaper(pid, [item.id]).paper);
  quiz.recordAttempt('', { skip: true }); quiz.advance();
  assert.equal(m.readStore(pid).items[0].wrongCount, 2); assert.equal(m.readStore(pid).items[0].mastered, false);
});
test('归档相同会话幂等，档案隔离，清理后不会由旧成绩重新生成错题', () => {
  const r = result(paper()); storage.write(`sessions:${pid}`, [r]);
  m.archiveSession(r); m.archiveSession(r);
  assert.equal(m.readStore(pid).items.length, 5); assert.equal(m.readStore('another').items.length, 0);
  const before = JSON.stringify(storage.read(`sessions:${pid}`));
  m.markMastered(pid, m.readStore(pid).items[0].id); assert.equal(m.clearMastered(pid).removed, 1);
  assert.equal(m.syncMistakes(pid).ok, true); assert.equal(m.readStore(pid).items.length, 4);
  assert.equal(JSON.stringify(storage.read(`sessions:${pid}`)), before);
});
test('首次错误答案保留，最近错误另存', () => {
  const p = paper(); m.archiveSession(result(p, 's1', '-111')); m.archiveSession(result(p, 's2', '-222'));
  const item = m.readStore(pid).items[0];
  assert.equal(item.firstUserAnswer, '-111'); assert.equal(item.userAnswer, '-222'); assert.equal(item.wrongCount, 2);
});
test('旧成绩回补不倒置首次/最近错误时间，也不覆盖较新的攻克状态', () => {
  const p = single(paper().questions[0]), now = Date.now();
  m.archiveSession({ ...result(p, 'new', '-222'), finishedAt: now });
  m.archiveSession({ ...result(p, 'old', '-111'), finishedAt: now - 1000 });
  let item = m.readStore(pid).items[0];
  assert.equal(item.firstUserAnswer, '-111'); assert.equal(item.userAnswer, '-222');
  assert.equal(item.firstWrongAt, now - 1000); assert.equal(item.lastWrongAt, now);
  m.markMastered(pid, item.id);
  m.archiveSession({ ...result(p, 'older', '-333'), finishedAt: now - 2000 });
  item = m.readStore(pid).items[0];
  assert.equal(item.mastered, true); assert.equal(item.userAnswer, '-222'); assert.equal(item.firstUserAnswer, '-333');
});
test('错题键保留题型、填空位置、比较目标，横式交换律与数值规范化有效', () => {
  const q = paper().questions[0], swapped = { ...q, params: { ...q.params, a: q.params.b, b: q.params.a } };
  assert.equal(m.mistakeKeyOf(q), m.mistakeKeyOf(swapped));
  assert.notEqual(m.mistakeKeyOf(q), m.mistakeKeyOf({ ...q, type: 'vertical' }));
  assert.notEqual(m.mistakeKeyOf({ ...q, type: 'fill', params: { ...q.params, hide: 'a' } }),
    m.mistakeKeyOf({ ...q, type: 'fill', params: { ...q.params, hide: 'b' } }));
  assert.notEqual(m.mistakeKeyOf({ ...q, type: 'compare', params: { ...q.params, compareTo: 2 } }),
    m.mistakeKeyOf({ ...q, type: 'compare', params: { ...q.params, compareTo: 3 } }));
  assert.equal(m.mistakeKeyOf(q), m.mistakeKeyOf({ ...q, params: { ...q.params, a: `00${q.params.a}.0` } }));
});
test('错题存储写入失败没有部分计数或归档标记；重试成功且不重复', () => {
  const r = result(paper()); failKey = `km:mistakes:${pid}`;
  assert.equal(m.archiveSession(r).code, 'WRITE_FAILED'); assert.equal(m.readStore(pid).items.length, 0);
  failKey = null; assert.equal(m.archiveSession(r).archivedCount, 5); assert.equal(m.archiveSession(r).archivedCount, 0);
});
test('成绩保存成功而错题写入失败，成绩可恢复且回补不新增成绩', () => {
  const s = quiz.createSession(paper()); failKey = `km:mistakes:${pid}`;
  for (const q of s.paper.questions) { quiz.recordAttempt('-999'); quiz.advance(); }
  assert.equal(quiz.getLastResult().saved, true); assert.equal(quiz.getLastResult().mistakesSaved, false);
  assert.equal(storage.read(`sessions:${pid}`).length, 1);
  failKey = null; assert.equal(m.syncMistakes(pid).ok, true); assert.equal(m.readStore(pid).items.length, 5);
  assert.equal(storage.read(`sessions:${pid}`).length, 1);
});
test('500错题上限拒绝整次超额归档，原数据逐字节不变', () => {
  const unique = new Map();
  for (let seed = 0; unique.size < 501; seed++) for (const q of paper(100, seed).questions) unique.set(m.mistakeKeyOf(q), q);
  const questions = [...unique.values()];
  storage.write(`mistakes:${pid}`, { version: 2, items: questions.slice(0, 500).map(q => m.createMistakeRecord(q, '-999')),
    archivedSessions: [] });
  const before = data.get(`km:mistakes:${pid}`);
  assert.equal(m.archiveSession(result(single(questions[500]))).code, 'CAPACITY_LIMIT');
  assert.equal(data.get(`km:mistakes:${pid}`), before); assert.equal(m.readStore(pid).items.length, 500);
});
test('保留窗口内防重索引有界；未知版本或坏记录不会被覆盖', () => {
  storage.write(`mistakes:${pid}`, { version: 2, items: [], archivedSessions: Array.from({ length: 2500 }, (_, i) => `old-${i}`) });
  const p = single(paper().questions[0]), r = result(p, 'new');
  assert.equal(m.archiveSession(r).ok, true); assert.equal(m.readStore(pid).archivedSessions.length, 2500);
  assert.equal(m.archiveSession(r).duplicate, true);
  storage.write(`mistakes:${pid}`, { version: 99, items: [] });
  const before = data.get(`km:mistakes:${pid}`);
  assert.equal(m.archiveSession(r).code, 'INVALID_STORE'); assert.equal(data.get(`km:mistakes:${pid}`), before);
});
test('V1完整快照可重练和升级，不伪造首次错误答案', () => {
  const legacy = m.createMistakeRecord(paper().questions[0], '-111');
  delete legacy.firstUserAnswer; delete legacy.sourcePaperKeys; legacy.key = 'legacy-key';
  storage.write(`mistakes:${pid}`, { version: 1, items: [legacy], archivedSessions: ['old'] });
  assert.equal(m.buildRetryPaper(pid, [legacy.id]).ok, true);
  assert.equal(m.readStore(pid).items[0].firstUserAnswer, undefined);
  m.markMastered(pid, legacy.id); assert.equal(storage.read(`mistakes:${pid}`).version, 2);
});
test('非法分母拒绝归档，摘要分知识点计数超出总量时不参与掌握度', () => {
  const q = clone(paper().questions[0]); q.kind = 'fraction'; q.params.denom = 0;
  assert.equal(m.archiveSession(result(single(q))).code, 'INVALID_RECORD');
  assert.equal(m.readStore(pid).items.length, 0);
  const s = summary('invalid-summary', 1, 5);
  s.kpCorrect['G1-01'] = 4;
  storage.write(`sessions:${pid}`, [s]);
  assert.deepEqual(stats.masteryByKP(pid), []);
});
function limitedVariant() {
  const p = paper(5, 1, 'G1-01'), q = p.questions[0];
  m.archiveSession(result(single(q)));
  const candidates = paper(100, 2, 'G1-01').questions;
  const keep = new Set(candidates.filter(c => dedupeKey(c) !== dedupeKey(q)).slice(0, 3).map(c => dedupeKey(c)));
  const excluded = new Set();
  for (let a = 0; a <= 10; a++) for (let b = 0; b <= 10; b++) {
    const key = dedupeKey({ ...q, params: { a, b } }); if (!keep.has(key)) excluded.add(key);
  }
  return { ids: [m.readStore(pid).items[0].id], excludeKeys: [...excluded], keep };
}
test('仅剩3道变式时返回实际题数和缺口，可进入会话', () => {
  const f = limitedVariant(), r = buildVariantPaper(pid, f.ids, { excludeKeys: f.excludeKeys, seed: 3 });
  assert.equal(r.ok, true); assert.equal(r.paper.questions.length, 3); assert.equal(r.shortfall, 2);
  assert.equal(r.paper.shortfall, 2); assert.equal(r.paper.options.requested, 5);
  assert.equal(quiz.createSession(r.paper).mode, 'variant');
});
test('原卷已压缩或删除仍排除最初原卷，下一组不复用上一组', () => {
  const p = paper(); m.archiveSession(result(p)); storage.write(`sessions:${pid}`, []);
  const ids = [m.readStore(pid).items[0].id], oldKeys = new Set(p.questions.map(q => dedupeKey(q)));
  const a = buildVariantPaper(pid, ids, { seed: 1 }); assert.equal(a.ok, true);
  assert.ok(a.paper.questions.every(q => !oldKeys.has(dedupeKey(q))));
  const previous = a.paper.questions.map(q => dedupeKey(q));
  const b = buildVariantPaper(pid, ids, { seed: 1, excludeKeys: previous }); assert.equal(b.ok, true);
  assert.ok(b.paper.questions.every(q => !previous.includes(dedupeKey(q))));
});
test('24道原错题分为20+4，剩余队列可继续且不静默丢弃', () => {
  const questions = SYLLABUS.map(kp => generatePaper({ kpIds: [kp.id], count: 5, types: [kp.types[0]], seed: 2 }).questions[0])
    .map((q, i) => ({ ...q, id: `q${i}` }));
  m.archiveSession(result({ id: 'all', questions }));
  const ids = m.readStore(pid).items.map(x => x.id), a = buildVariantPaper(pid, ids, { seed: 3 });
  assert.equal(a.ok, true); assert.equal(a.totalRequested, 120); assert.equal(a.remainingIds.length, 4);
  assert.equal(a.paper.sourceMistakeIds.length, 20); assert.ok(a.paper.questions.length <= 100);
  const b = buildVariantPaper(pid, a.remainingIds, { seed: 4, excludeKeys: a.paper.questions.map(q => dedupeKey(q)) });
  assert.equal(b.ok, true); assert.equal(b.remainingIds.length, 0);
  assert.equal(new Set([...a.paper.sourceMistakeIds, ...b.paper.sourceMistakeIds]).size, 24);
});
test('掌握度84.5与59.5按未舍入数值分档，完整与摘要累计一致', () => {
  storage.write(`sessions:${pid}`, [summary('a', 84), summary('b', 85),
    summary('c', 59, 100, 0, 'G1-02'), summary('d', 60, 100, 0, 'G1-02')]);
  const all = stats.masteryByKP(pid);
  assert.equal(all.find(i => i.kpId === 'G1-01').level, 'warn');
  assert.equal(all.find(i => i.kpId === 'G1-01').mastery, 84.5);
  assert.equal(all.find(i => i.kpId === 'G1-02').level, 'weak');
});
test('零作答超时或全跳过不增加练习量、打卡或徽章', () => {
  storage.write(`sessions:${pid}`, [summary('empty', 0, 50, 50)]);
  assert.equal(stats.practiceSummary(pid).totalQuestions, 0); assert.equal(stats.practiceSummary(pid).days, 0);
  assert.equal(stats.streakDays(pid), 0); assert.ok(stats.badges(pid).every(b => !b.earned));
  assert.ok(stats.activityCalendar(pid).every(d => d.count === 0));
});
test('损坏历史项被过滤，趋势少于2条提示不足，同时间按ID排序', () => {
  storage.write(`sessions:${pid}`, [null, {}, summary('a', 80)]);
  assert.equal(stats.accuracyTrend(pid).code, 'INSUFFICIENT_DATA');
  const time = Date.now();
  storage.write(`sessions:${pid}`, [summary('a', 80, 100, 0, 'G1-01', time), summary('b', 90, 100, 0, 'G1-01', time)]);
  const trend = stats.accuracyTrend(pid, 7);
  assert.equal(trend.ok, true); assert.equal(trend.direction, '上升'); assert.equal(trend.delta, 10);
  assert.deepEqual(trend.points.map(p => p.id), ['a', 'b']);
});
test('跳过不入掌握度分母，只有跳过的已练知识点显示未练习', () => {
  const p = paper(), r = result(p);
  r.detail = p.questions.map(q => ({ questionId: q.id, kpId: q.kpId, userAnswer: '', correct: false, skipped: true }));
  r.correct = 0; r.wrong = 0; r.skipped = 5;
  storage.write(`sessions:${pid}`, [r]);
  const mastery = stats.masteryByKP(pid)[0];
  assert.equal(mastery.mastery, null); assert.equal(mastery.answered, 0);
});
test('7/30/100日徽章有真实推导日期，记录清理和打卡中断不撤回', () => {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const records = Array.from({ length: 100 }, (_, i) => {
    const day = new Date(now); day.setDate(day.getDate() - 99 + i);
    return summary(`day-${i}`, 1, 1, 0, 'G1-01', day.getTime());
  });
  storage.write(`sessions:${pid}`, records);
  assert.equal(stats.streakDays(pid), 100); assert.equal(stats.updateAwards(pid), true);
  const awards = stats.badges(pid); assert.ok(awards.every(b => b.earned));
  assert.equal(awards[0].earnedAt, dateStr(records[6].finishedAt));
  assert.equal(awards[2].earnedAt, dateStr(now));
  storage.write(`sessions:${pid}`, []);
  assert.equal(stats.streakDays(pid), 0); assert.deepEqual(stats.badges(pid), awards);
});
test('最近8周56格，同日多次计题数但只记一天；跨日与断档重算', () => {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const old = new Date(now); old.setDate(old.getDate() - 4);
  storage.write(`sessions:${pid}`, [summary('a', 1, 1, 0, 'G1-01', now.getTime()),
    summary('b', 1, 1, 0, 'G1-01', now.getTime()), summary('c', 1, 1, 0, 'G1-01', yesterday.getTime())]);
  assert.equal(stats.practiceSummary(pid).days, 2); assert.equal(stats.streakDays(pid), 2);
  const calendar = stats.activityCalendar(pid); assert.equal(calendar.length, 56); assert.equal(calendar.at(-1).count, 2);
  storage.write(`sessions:${pid}`, [summary('old', 1, 1, 0, 'G1-01', old.getTime())]);
  assert.equal(stats.streakDays(pid), 0);
});
