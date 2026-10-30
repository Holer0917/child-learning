import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePaperStats, removePaperQuestion, checkPaperReadiness } from '../src/domain/paper.js';
import { generatePaper, regeneratePaper, dedupeKey } from '../src/domain/generator.js';

const fixture = stars => {
  const questions = stars.map((difficulty, i) => ({ id: `q${i + 1}`, kpId: `star-${difficulty}`, difficulty }));
  return { id: 'fixture', questions, options: { requested: stars.length, count: stars.length, difficulty: 'normal' },
    stats: calculatePaperStats(questions), shortfall: 0, warnings: [] };
};

test('删除单题同步实际 count、均值、分布与删除数量，保留剩余 ID 和原卷', () => {
  const paper = fixture([1, 2, 3, 2, 1]);
  const snapshot = JSON.stringify(paper);
  Object.freeze(paper.questions);
  Object.freeze(paper.options);
  Object.freeze(paper);
  const edited = removePaperQuestion(paper, 'q3');
  assert.equal(edited.id, paper.id);
  assert.deepEqual(edited.questions.map(q => q.id), ['q1', 'q2', 'q4', 'q5']);
  assert.deepEqual(edited.stats, { total: 4, avgStar: 1.5, dist: { 'star-1': 2, 'star-2': 2 } });
  assert.deepEqual(edited.options, { requested: 5, count: 4, difficulty: 'normal' });
  assert.equal(edited.removedCount, 1);
  assert.equal(edited.shortfall, 1);
  assert.equal(JSON.stringify(paper), snapshot);
  assert.equal(checkPaperReadiness(edited).ok, true, '实际少于 5 道仍可作为编辑后的练习');
});

test('无效/重复删除不增加次数，容量缺口与主动删除可区分', () => {
  const paper = fixture([1, 2, 1, 2, 1]);
  paper.options.requested = 10;
  paper.shortfall = 5;
  assert.equal(removePaperQuestion(paper, 'missing'), paper);
  const edited = removePaperQuestion(paper, 'q2');
  assert.equal(removePaperQuestion(edited, 'q2'), edited);
  assert.equal(edited.shortfall - edited.removedCount, 5, '原始容量缺口不因手动删除改变');
});

test('可以删到空卷，统计不出现 NaN，空卷拒绝进入答题', () => {
  let paper = fixture([1, 2, 3, 2, 1]);
  for (const id of paper.questions.map(q => q.id)) paper = removePaperQuestion(paper, id);
  assert.deepEqual(paper.stats, { total: 0, avgStar: 0, dist: {} });
  assert.equal(paper.options.count, 0);
  assert.equal(paper.options.requested, 5);
  assert.equal(paper.removedCount, 5);
  assert.equal(checkPaperReadiness(paper).code, 'EMPTY_PAPER');
});

test('删题后重新核对简单/挑战比例，删除其他星级可恢复', () => {
  let easy = fixture([1, 1, 1, 1, 1, 1, 1, 2, 2, 2]);
  easy.options.difficulty = 'easy';
  assert.equal(checkPaperReadiness(easy).ok, true);
  easy = removePaperQuestion(easy, 'q1');
  assert.equal(checkPaperReadiness(easy).code, 'DIFFICULTY_RATIO');
  easy = removePaperQuestion(easy, 'q8');
  assert.equal(checkPaperReadiness(easy).ok, true);
  let hard = fixture([3, 3, 2, 2]);
  hard.options.difficulty = 'hard';
  assert.equal(checkPaperReadiness(hard).ok, true);
  hard = removePaperQuestion(hard, 'q1');
  assert.equal(checkPaperReadiness(hard).code, 'DIFFICULTY_RATIO');
  hard = removePaperQuestion(hard, 'q3');
  assert.equal(checkPaperReadiness(hard).ok, true);
});

test('重出使用原请求量和原设置，排除原生成批次中包含已删除题的全部键', () => {
  const source = generatePaper({ kpIds: ['G3-01'], count: 10, types: ['vertical'], difficulty: 'hard', seed: 4 });
  const keys = new Set(source.questions.map(q => dedupeKey(q, true)));
  const edited = removePaperQuestion(source, source.questions[0].id);
  const snapshot = JSON.stringify(edited);
  const fresh = regeneratePaper(edited, keys);
  assert.equal(fresh.questions.length, 10);
  assert.equal(fresh.options.requested, 10);
  assert.deepEqual(fresh.options.types, ['vertical']);
  assert.equal(fresh.options.difficulty, 'hard');
  assert.ok(fresh.questions.every(q => q.kpId === 'G3-01' && !keys.has(dedupeKey(q, true))));
  assert.equal(fresh.stats.total, 10);
  assert.equal(fresh.removedCount ?? 0, 0);
  assert.equal(JSON.stringify(edited), snapshot);
});

test('有限剩余题库可少出新题，仍保证零原题重用及正确实际统计', () => {
  const source = generatePaper({ kpIds: ['G1-01'], count: 20, seed: 7 });
  const keys = new Set(source.questions.map(q => dedupeKey(q, true)));
  const fresh = regeneratePaper(source);
  assert.ok(fresh.questions.length > 0 && fresh.questions.length < 20);
  assert.ok(fresh.questions.every(q => !keys.has(dedupeKey(q, true))));
  assert.equal(fresh.stats.total, fresh.questions.length);
  assert.equal(fresh.shortfall, 20 - fresh.questions.length);
});

test('题库耗尽时抛专用错误并保留原卷；交换律变体不能绕过排除', () => {
  const source = generatePaper({ kpIds: ['G1-01'], count: 10, seed: 3 });
  const snapshot = JSON.stringify(source);
  const full = new Set();
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) if (a + b <= 10) {
    full.add(dedupeKey({ kpId: 'G1-01', op: 'add', params: { a, b } }, true));
  }
  assert.throws(() => regeneratePaper(source, full), error => error.code === 'REGENERATION_EXHAUSTED');
  assert.equal(JSON.stringify(source), snapshot);
  const exclude = new Set([dedupeKey({ kpId: 'G1-01', op: 'add', params: { a: 1, b: 2 } }, true)]);
  const fresh = generatePaper({ kpIds: ['G1-01'], count: 100, seed: 9, excludeKeys: exclude });
  assert.ok(fresh.questions.every(q => !(q.params.a === 1 && q.params.b === 2) && !(q.params.a === 2 && q.params.b === 1)));
  assert.equal(exclude.size, 1);
});
