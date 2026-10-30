import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePaperStats } from '../src/domain/paper.js';
import { generatePaper } from '../src/domain/generator.js';

const sample = (kpId, difficulty, count) => Array.from({ length: count }, () => ({ kpId, difficulty }));

test('按题目加权计算：6 道 1 星、3 道 2 星、1 道 3 星为 1.5 星', () => {
  const questions = [...sample('G1-01', 1, 6), ...sample('G1-03', 2, 3), ...sample('G3-01', 3, 1)];
  assert.deepEqual(calculatePaperStats(questions), {
    total: 10, avgStar: 1.5, dist: { 'G1-01': 6, 'G1-03': 3, 'G3-01': 1 }
  });
});

test('一位小数按四舍五入，空卷不出现 NaN；计算不改动题目', () => {
  const questions = [...sample('G1-03', 2, 19), ...sample('G3-01', 3, 1)];
  questions.forEach(Object.freeze);
  Object.freeze(questions);
  assert.equal(calculatePaperStats(questions).avgStar, 2.1); // 41/20=2.05
  assert.deepEqual(calculatePaperStats([]), { total: 0, avgStar: 0, dist: {} });
  assert.equal(questions.length, 20);
});

test('当前题目集合决定统计，题目变化后不沿用原分布', () => {
  const questions = [...sample('G1-01', 1, 3), ...sample('G1-03', 2, 2), ...sample('G1-06', 2, 2)];
  assert.deepEqual(calculatePaperStats(questions), { total: 7, avgStar: 1.6,
    dist: { 'G1-01': 3, 'G1-03': 2, 'G1-06': 2 } });
  const remaining = questions.filter(q => q.kpId !== 'G1-01');
  assert.deepEqual(calculatePaperStats(remaining), { total: 4, avgStar: 2,
    dist: { 'G1-03': 2, 'G1-06': 2 } });
  assert.equal(questions.length, 7);
});

test('有限题库返回的 Paper.stats 使用实际数量，与请求数量分开', () => {
  const paper = generatePaper({ kpIds: ['G1-01'], count: 100, seed: 8 });
  assert.ok(paper.questions.length > 0 && paper.questions.length < 100);
  assert.equal(paper.options.requested, 100);
  assert.deepEqual(paper.stats, { total: paper.questions.length, avgStar: 1, dist: { 'G1-01': paper.questions.length } });
  assert.equal(paper.stats.total, paper.options.count);
});
