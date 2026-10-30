// B03：真实生成结果与原知识点约束校验，Node >=22，无第三方依赖。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SYLLABUS, getKnowledgePoint } from '../src/domain/syllabus.js';
import { createRandom } from '../src/utils/random.js';
import { generatePaper, generateQuestions, regenerateQuestion, generateFromSpec,
  adjustSpec, validatePaperOptions, dedupeKey } from '../src/domain/generator.js';

function assertConstraints(raw, spec) {
  const p = raw.params;
  for (const key of ['a', 'b', 'c', 'quotient']) {
    if (spec[key]) {
      assert.ok(Number(p[key]) >= spec[key].min && Number(p[key]) <= spec[key].max, `${key} 越界：${JSON.stringify(p)}`);
    }
  }
  if (spec.result) assert.ok(Number(p.result) >= spec.result.min && Number(p.result) <= spec.result.max);
  if (spec.carry !== undefined) assert.equal(p.carry, spec.carry);
  if (spec.borrow !== undefined) assert.equal(p.borrow, spec.borrow);
  if (spec.strictNoCarry) assert.equal(p.carry || p.borrow, false);
  if (spec.quotientHasZero) assert.ok(String(p.quotient).includes('0'));
  if (spec.remainder) assert.ok(p.rem > 0 && p.rem < p.b);
  if (spec.remainder === false) assert.equal(p.rem, 0);
  if (spec.step) assert.equal(Number(p.a) % spec.step, 0);
  if (spec.stepB || spec.step) assert.equal(Number(p.b) % (spec.stepB ?? spec.step), 0);
  if (spec.denom) assert.ok(p.denom >= spec.denom.min && p.denom <= spec.denom.max);
  if (spec.pattern) {
    for (const [index, op] of [[0, p.op1], [1, p.op2]]) {
      assert.ok([].concat(spec.pattern[index]).includes(op));
    }
    assert.equal(p.paren, !!spec.paren);
  }
}

function assertPaper(paper, ids, types, difficulty) {
  assert.ok(paper.questions.length > 0 && paper.questions.length <= paper.options.requested);
  assert.equal(paper.options.count, paper.questions.length);
  assert.equal(paper.shortfall, paper.options.requested - paper.questions.length);
  assert.equal(new Set(paper.questions.map(q => dedupeKey(q, false))).size, paper.questions.length);
  for (const q of paper.questions) {
    const kp = getKnowledgePoint(q.kpId);
    assert.ok(ids.includes(q.kpId), '不得引入未选知识点');
    assert.ok(types.includes(q.type) && kp.types.includes(q.type), '题型必须同时符合选择与知识点能力');
    assert.equal(q.difficulty, kp.difficulty, '切换难度不能篡改知识点星级');
    assertConstraints(q, kp.spec);
  }
  if (difficulty !== 'normal') {
    const star = difficulty === 'easy' ? 1 : 3;
    const percent = difficulty === 'easy' ? 70 : 50;
    assert.ok(paper.questions.filter(q => q.difficulty === star).length >= Math.ceil(paper.questions.length * percent / 100));
  }
}

test('预检查拒绝空选、非法档位/题型、全不匹配和不存在的目标星级', () => {
  for (const [options, code] of [
    [{ kpIds: [] }, 'NO_KNOWLEDGE_POINTS'],
    [{ kpIds: ['G1-01'], difficulty: 'other' }, 'INVALID_DIFFICULTY'],
    [{ kpIds: ['G1-01'], types: [] }, 'INVALID_QUESTION_TYPES'],
    [{ kpIds: ['G1-01'], types: ['unknown'] }, 'INVALID_QUESTION_TYPES'],
    [{ kpIds: ['G1-01'], types: ['vertical'] }, 'UNSUPPORTED_COMBINATION'],
    [{ kpIds: ['G3-01'], difficulty: 'easy' }, 'DIFFICULTY_UNAVAILABLE'],
    [{ kpIds: ['G1-01'], difficulty: 'hard' }, 'DIFFICULTY_UNAVAILABLE'],
    [{ kpIds: ['G1-08', 'G3-01'], types: ['vertical'], difficulty: 'easy' }, 'DIFFICULTY_UNAVAILABLE']
  ]) {
    const checked = validatePaperOptions(options);
    assert.equal(checked.ok, false);
    assert.equal(checked.code, code);
    assert.throws(() => generatePaper(options), error => error.code === code && error.message === checked.message);
  }
});

test('部分匹配事先列明跳过项，生成结果不偷偷切换题型或增加知识点', () => {
  const options = { kpIds: ['G1-01', 'G1-08'], types: ['horizontal', 'chain'], count: 30, seed: 24 };
  const snapshot = JSON.stringify(options);
  const checked = validatePaperOptions(options);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.skippedKpIds, ['G1-08']);
  assert.equal(checked.warnings.length, 2);
  assert.ok(checked.warnings[0].includes('100 以内数的认识与比较'));
  const paper = generatePaper(options);
  assertPaper(paper, options.kpIds, options.types, 'normal');
  assert.ok(paper.questions.every(q => q.kpId === 'G1-01' && q.type === 'horizontal'));
  assert.deepEqual(paper.warnings, checked.warnings);
  assert.equal(JSON.stringify(options), snapshot);
});

test('简单/挑战配额按向上取整执行：5/7/30/37/100 题与 30 个固定种子', () => {
  for (const difficulty of ['easy', 'hard']) {
    for (const count of [5, 7, 30, 37, 100]) {
      for (let seed = 1; seed <= 30; seed++) {
        const kpIds = difficulty === 'easy' ? ['G1-08', 'G1-03'] : ['G3-01', 'G1-03'];
        const types = difficulty === 'easy' ? ['compare', 'horizontal'] : ['horizontal'];
        const paper = generatePaper({ kpIds, count, types, difficulty, seed });
        assert.equal(paper.questions.length, count);
        assertPaper(paper, kpIds, types, difficulty);
      }
    }
  }
});

test('简单档典型组合 30 题至少 21 道 1 星，挑战典型组合至少 15 道 3 星', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const easy = generatePaper({ kpIds: ['G1-01', 'G1-03'], count: 30, difficulty: 'easy', seed });
    assert.equal(easy.questions.length, 30);
    assert.ok(easy.questions.filter(q => q.difficulty === 1).length >= 21);
    const hard = generatePaper({ kpIds: ['G3-01', 'G3-02'], count: 30, difficulty: 'hard', seed });
    assert.equal(hard.questions.length, 30);
    assert.ok(hard.questions.filter(q => q.difficulty === 3).length >= 15);
  }
});

test('简单题库容量不足时按实际题量保持比例，明确减少题量而非静默降级', () => {
  const kpIds = ['G1-01', 'G3-01'];
  const paper = generatePaper({ kpIds, count: 100, difficulty: 'easy', seed: 62 });
  assertPaper(paper, kpIds, ['horizontal'], 'easy');
  assert.ok(paper.shortfall > 0);
  assert.ok(paper.warnings.some(message => message.includes('已减少实际题量')));
});

test('同知识点多选横式/竖式时均衡分配；5/30/37 题各类型数量相差不超过 1', () => {
  for (const count of [5, 30, 37]) for (let seed = 1; seed <= 20; seed++) {
    const types = ['horizontal', 'vertical'];
    const paper = generatePaper({ kpIds: ['G2-01'], types, count, seed });
    assertPaper(paper, ['G2-01'], types, 'normal');
    const horizontal = paper.questions.filter(q => q.type === 'horizontal').length;
    assert.ok(Math.abs(horizontal - (count - horizontal)) <= 1);
    assert.ok(paper.questions.filter(q => q.type === 'vertical').every(q => q.layout?.rows?.length === 2 && q.layout.width >= 2));
  }
});

test('原始 24 个知识点的全部支持题型均可单独组卷，且始终守住原规格', () => {
  for (const kp of SYLLABUS) for (const type of kp.types) {
    const paper = generatePaper({ kpIds: [kp.id], types: [type], count: 10, seed: 29 });
    assertPaper(paper, [kp.id], [type], 'normal');
    assert.ok(paper.questions.every(q => q.type === type));
  }
});

test('简单/挑战均保留进退位、商含 0、整十整百、分数等原始约束，不修改配置', () => {
  for (const kp of SYLLABUS) {
    const snapshot = JSON.stringify(kp.spec);
    for (const difficulty of ['easy', 'hard']) {
      const adjusted = adjustSpec(kp.spec, difficulty);
      for (const key of ['carry', 'borrow', 'strictNoCarry', 'quotientHasZero', 'remainder', 'step', 'stepB']) {
        assert.equal(adjusted[key], kp.spec[key]);
      }
      for (const key of ['a', 'b', 'c', 'quotient']) if (kp.spec[key]) {
        assert.ok(adjusted[key].min >= kp.spec[key].min && adjusted[key].max <= kp.spec[key].max);
      }
      const rng = createRandom(25);
      let sampled = 0;
      for (let i = 0; i < 40; i++) {
        const raw = generateFromSpec(adjusted, rng);
        if (raw) { assertConstraints(raw, kp.spec); sampled++; }
      }
      assert.ok(sampled > 0, `${kp.id}/${difficulty} 调整后没有可用样本`);
    }
    assert.equal(JSON.stringify(kp.spec), snapshot);
  }
});

test('单知识点批量和换一题签名兼容；保持题型，拒绝知识点不支持的题型', () => {
  const questions = generateQuestions('G2-01', 10, { types: ['vertical'], seed: 2 });
  assert.equal(questions.length, 10);
  const next = regenerateQuestion(questions[0], new Set(questions.map(q => dedupeKey(q, true))));
  assert.ok(next && next.type === 'vertical' && next.kpId === 'G2-01' && next.id === questions[0].id);
  assertConstraints(next, getKnowledgePoint('G2-01').spec);
  assert.equal(regenerateQuestion({ ...questions[0], kpId: 'G1-01' }), null);
  assert.throws(() => generateQuestions('G3-01', 10, { difficulty: 'easy' }), error => error.code === 'DIFFICULTY_UNAVAILABLE');
});
