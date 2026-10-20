/**
 * 出题引擎
 *
 * 设计思想：**配置驱动**。
 * 每个知识点在 syllabus.js 中声明一份 `spec`（数值约束规格），
 * 本引擎只负责"读规格 → 造数值 → 校验约束 → 渲染题型"，
 * 不认识任何具体知识点。因此新增知识点只需追加配置，本文件无需改动。
 *
 * 三条必须守住的底线：
 *   ① 生成的题目绝不超纲（严格满足 spec 约束）—— 对应 FR-06
 *   ② 生成的答案绝对正确（小数用整数运算规避浮点误差）—— 对应 NFR-03
 *   ③ 同一份卷子内不出现重复题目 —— 对应 FR-07
 */

import { getKnowledgePoint } from './syllabus.js';
import { createRandom, makeId } from '../utils/random.js';
import { formatScaled, simplify } from '../utils/format.js';

/** 运算符号 */
const SIGN = { add: '+', sub: '−', mul: '×', div: '÷' };

/** 题型常量 */
export const TYPES = ['horizontal', 'vertical', 'compare', 'fill', 'chain'];

/* ================================================================== *
 * 对外接口
 * ================================================================== */

/**
 * 生成一份卷子
 *
 * @param {Object}   opts
 * @param {string[]} opts.kpIds       知识点编号列表
 * @param {number}   opts.count       题量 5~100
 * @param {string}   opts.difficulty  'easy' | 'normal' | 'hard'
 * @param {string[]} opts.types       题型列表
 * @param {number}   [opts.seed]      随机种子（用于可复现测试）
 * @returns {Paper}
 */
export function generatePaper({
  kpIds = [],
  count = 20,
  difficulty = 'normal',
  types = ['horizontal'],
  seed
} = {}) {
  const ids = (kpIds ?? []).filter((id) => getKnowledgePoint(id));
  if (ids.length === 0) throw new Error('请至少选择一个知识点');

  const total = clamp(Math.round(count) || 20, 5, 100);
  const rng = createRandom(seed ?? Date.now());

  // 题量按知识点均分，余数补给前面的知识点
  const quota = distribute(total, ids.length);

  const questions = [];
  const strictKeys = new Set();   // 一级去重：加乘交换律视为同一题
  const looseKeys = new Set();    // 二级去重：仅按操作数原序（用于兜底）

  ids.forEach((kpId, i) => {
    const kp = getKnowledgePoint(kpId);
    const usableTypes = intersectTypes(kp.types, types);
    const bucket = [];

    let made = 0;
    let guard = 0;
    const limit = Math.max(quota[i] * 40, 400);

    while (made < quota[i] && guard < limit) {
      guard++;
      const spec = adjustSpec(kp.spec, difficulty);
      const raw = generateFromSpec(spec, rng);
      if (!raw) continue;

      const q = finalize(raw, kp, rng.pick(usableTypes), rng);
      const k = dedupeKey(q, true);
      if (strictKeys.has(k)) continue;

      strictKeys.add(k);
      looseKeys.add(dedupeKey(q, false));
      bucket.push(q);
      made++;
    }

    // 一级去重下数量不足 → 放宽为二级去重补齐（交换律不再视为同题）
    let g2 = 0;
    while (made < quota[i] && g2 < limit) {
      g2++;
      const spec = adjustSpec(kp.spec, difficulty);
      const raw = generateFromSpec(spec, rng);
      if (!raw) continue;

      const q = finalize(raw, kp, rng.pick(usableTypes), rng);
      const k = dedupeKey(q, false);
      if (looseKeys.has(k)) continue;

      looseKeys.add(k);
      bucket.push(q);
      made++;
    }

    questions.push(...bucket);
  });

  // 若某个知识点的组合空间不足（如"20 以内进位加法"只有 36 种组合），
  // 把缺口转嫁给其它已选知识点补齐，而不是简单少出几道题。
  if (questions.length < total) {
    let progressed = true;
    let rounds = 0;
    while (questions.length < total && progressed && rounds < 6) {
      progressed = false;
      rounds++;
      for (const kpId of ids) {
        if (questions.length >= total) break;
        const kp = getKnowledgePoint(kpId);
        const usableTypes = intersectTypes(kp.types, types);
        const need = total - questions.length;
        let added = 0;
        let guard = 0;

        while (added < need && guard < need * 60) {
          guard++;
          const raw = generateFromSpec(adjustSpec(kp.spec, difficulty), rng);
          if (!raw) continue;
          const q = finalize(raw, kp, rng.pick(usableTypes), rng);
          const k = dedupeKey(q, false);
          if (looseKeys.has(k)) continue;
          looseKeys.add(k);
          questions.push(q);
          added++;
          progressed = true;
        }
      }
    }
  }

  // 打乱，避免同知识点的题扎堆
  rng.shuffle(questions);
  questions.forEach((q, i) => { q.id = `q${i + 1}`; });

  return {
    id: makeId('p'),
    questions,
    options: {
      kpIds: ids,
      count: questions.length,
      requested: total,
      difficulty,
      types
    },
    // 实际题量少于请求题量（该知识点组合已接近上限）
    shortfall: total - questions.length,
    createdAt: Date.now()
  };
}

/**
 * 单知识点批量出题
 */
export function generateQuestions(kpId, n = 10, {
  types, difficulty = 'normal', seed
} = {}) {
  const kp = getKnowledgePoint(kpId);
  if (!kp) return [];
  return generatePaper({
    kpIds: [kpId],
    count: n,
    difficulty,
    types: types ?? kp.types,
    seed
  }).questions;
}

/**
 * 保持知识点与题型，换一道新题（"换一题"按钮）
 */
export function regenerateQuestion(question, exclude = new Set()) {
  const kp = getKnowledgePoint(question?.kpId);
  if (!kp) return null;

  const rng = createRandom();
  const spec = kp.spec;

  for (let i = 0; i < 200; i++) {
    const raw = generateFromSpec(spec, rng);
    if (!raw) continue;
    const q = finalize(raw, kp, question.type, rng);
    q.id = question.id;
    if (exclude.has(dedupeKey(q, true))) continue;
    return q;
  }
  return null;
}

/* ================================================================== *
 * 数值生成
 * ================================================================== */

/**
 * 依据 spec 生成一道题的原始数值
 * @returns {Object|null} 约束过紧导致生成失败时返回 null
 */
export function generateFromSpec(spec, rng) {
  switch (spec.op) {
    case 'add':     return genAdd(spec, rng);
    case 'sub':     return genSub(spec, rng);
    case 'mul':     return genMul(spec, rng);
    case 'div':     return genDiv(spec, rng);
    case 'mix':     return genMix(spec, rng);
    case 'compare': return genCompare(spec, rng);
    case 'addSub':  return genAddSub(spec, rng);
    default:
      console.warn('[generator] 未知运算类型：', spec.op);
      return null;
  }
}

/** 加法（含进位约束） */
function genAdd(spec, rng) {
  for (let i = 0; i < 120; i++) {
    const a = rng.int(spec.a.min, spec.a.max);
    const b = rng.int(spec.b.min, spec.b.max);
    const carry = (a % 10) + (b % 10) >= 10;

    if (spec.carry === true && !carry) continue;
    if (spec.carry === false && carry) continue;

    const r = a + b;
    if (!inRange(r, spec.result)) continue;

    return {
      op: 'add', kind: 'int', a, b, answer: String(r),
      params: { op: 'add', a, b, result: r,
                digits: digits(Math.max(a, b)), carry }
    };
  }
  return null;
}

/** 减法（含退位约束） */
function genSub(spec, rng) {
  for (let i = 0; i < 120; i++) {
    const a = rng.int(spec.a.min, spec.a.max);
    const b = rng.int(spec.b.min, spec.b.max);
    if (a < b) continue;                       // 小学阶段不出现负数

    const borrow = (a % 10) < (b % 10);
    if (spec.borrow === true && !borrow) continue;
    if (spec.borrow === false && borrow) continue;

    const r = a - b;
    if (!inRange(r, spec.result)) continue;

    return {
      op: 'sub', kind: 'int', a, b, answer: String(r),
      params: { op: 'sub', a, b, result: r, digits: digits(a), borrow }
    };
  }
  return null;
}

/** 加减通用（随机选加或减），支持整十数 / 整百数约束 */
function genAddSub(spec, rng) {
  if (spec.kind === 'fraction') return genFraction(spec, rng);
  if (spec.kind === 'decimal')  return genDecimal(spec, rng);

  for (let i = 0; i < 160; i++) {
    const a = pickOperand(spec.a, spec.step, rng);
    const b = pickOperand(spec.b, spec.stepB ?? spec.step, rng);
    const isAdd = rng.bool(0.5);
    const r = isAdd ? a + b : a - b;
    if (r < 0) continue;
    if (!inRange(r, spec.result)) continue;

    // 不进位 / 不退位（G1-06）
    if (spec.strictNoCarry) {
      const c = (a % 10) + (b % 10) >= 10;
      const w = (a % 10) < (b % 10);
      if (isAdd && c) continue;
      if (!isAdd && w) continue;
    }

    const op = isAdd ? 'add' : 'sub';
    return {
      op, kind: 'int', a, b, answer: String(r),
      params: { op, a, b, result: r, digits: digits(Math.max(a, b)),
                carry: isAdd && (a % 10) + (b % 10) >= 10,
                borrow: !isAdd && (a % 10) < (b % 10) }
    };
  }
  return null;
}

/** 乘法 */
function genMul(spec, rng) {
  for (let i = 0; i < 60; i++) {
    const a = rng.int(spec.a.min, spec.a.max);
    const b = rng.int(spec.b.min, spec.b.max);
    const r = a * b;
    if (!inRange(r, spec.result)) continue;

    return {
      op: 'mul', kind: 'int', a, b, answer: String(r),
      params: { op: 'mul', a, b, result: r, digits: digits(Math.max(a, b)) }
    };
  }
  return null;
}

/** 除法（支持余数与"商含 0"约束） */
function genDiv(spec, rng) {
  const qMin = spec.quotient?.min ?? 2;
  const qMax = spec.quotient?.max ?? 9;

  for (let i = 0; i < 300; i++) {
    const b = rng.int(spec.b.min, spec.b.max);
    const q = rng.int(qMin, qMax);

    if (spec.quotientHasZero && !String(q).includes('0')) continue;

    let dividend = b * q;
    let rem = 0;

    if (spec.remainder) {
      rem = rng.int(1, b - 1);
      dividend += rem;
    }

    if (spec.a && !inRange(dividend, spec.a)) continue;

    const answer = spec.remainder ? `${q}余${rem}` : String(q);

    return {
      op: 'div', kind: 'int', a: dividend, b, answer,
      params: { op: 'div', a: dividend, b, quotient: q, rem,
                result: spec.remainder ? dividend : q,
                digits: digits(q), quotientHasZero: String(q).includes('0') }
    };
  }
  return null;
}

/**
 * 混合运算
 *
 * spec.pattern 定义运算模式，第二项可以是数组（随机选一个）。
 *   ['×', ['+','-']]   → a × b ± c        （无括号）
 *   ['+', '-']         → a + b − c        （无括号）
 *   ['+', '÷'] paren   → (a + b) ÷ c      （需括号）
 *
 * 求值规则：**先算括号内**（即先算 a op1 b），再算 op2。
 * 这与 G2-05 / G2-08 / G3-06 三个知识点的教学要求一致。
 */
function genMix(spec, rng) {
  const op1 = Array.isArray(spec.pattern[0]) ? rng.pick(spec.pattern[0]) : spec.pattern[0];
  const op2 = Array.isArray(spec.pattern[1]) ? rng.pick(spec.pattern[1]) : spec.pattern[1];

  for (let i = 0; i < 400; i++) {
    const a = rng.int(spec.a.min, spec.a.max);
    const b = rng.int(spec.b.min, spec.b.max);
    const c = rng.int(spec.c.min, spec.c.max);

    const mid = apply(op1, a, b);
    if (mid == null || mid < 0) continue;

    const r = apply(op2, mid, c);
    if (r == null || r < 0) continue;
    if (!Number.isInteger(r)) continue;
    if (!inRange(r, spec.result)) continue;

    return {
      op: 'mix', kind: 'int', answer: String(r),
      params: { op: 'mix', a, b, c, op1, op2, mid, result: r,
                paren: !!spec.paren,
                digits: digits(Math.max(a, b, c)) }
    };
  }
  return null;
}

/** 比较大小（两个数直接比较） */
function genCompare(spec, rng) {
  for (let i = 0; i < 60; i++) {
    const a = rng.int(spec.a.min, spec.a.max);
    let b = rng.int(spec.b.min, spec.b.max);
    // 七成概率避免相等，让题目更有意义
    if (a === b && rng.bool(0.7)) {
      b = b >= spec.b.max ? b - 1 : b + 1;
    }

    const sign = a > b ? '>' : (a < b ? '<' : '=');
    return {
      op: 'compare', kind: 'sign', a, b, answer: sign,
      params: { op: 'compare', a, b, result: sign,
                digits: digits(Math.max(a, b)) }
    };
  }
  return null;
}

/** 同分母分数加减，结果约分为最简分数 */
function genFraction(spec, rng) {
  for (let i = 0; i < 80; i++) {
    const denom = rng.int(spec.denom.min, spec.denom.max);
    let n1 = rng.int(1, denom - 1);
    let n2 = rng.int(1, denom - 1);
    const isAdd = rng.bool(0.5);

    if (!isAdd && n1 < n2) [n1, n2] = [n2, n1];
    const n = isAdd ? n1 + n2 : n1 - n2;
    if (n <= 0) continue;

    const [sn, sd] = simplify(n, denom);
    const answer = sd === 1 ? String(sn) : `${sn}/${sd}`;
    const op = isAdd ? 'add' : 'sub';

    return {
      op, kind: 'fraction', a: n1, b: n2, denom, answer,
      // num 保留未约分的分子：判分展示与变式题反推都要还原原算式，
      // 否则 3/6 + 1/6 会被误当成 1/2 的同型题。
      params: { op, a: n1, b: n2, denom, result: n,
                num: n, denomRaw: denom, scale: 1,
                digits: 1, kind: 'fraction' }
    };
  }
  return null;
}

/**
 * 一位小数加减
 *
 * 关键：把小数放大 10^scale 倍转为**整数运算**，再还原为小数字符串。
 * 这从根本上规避了 IEEE 754 浮点误差
 * （如 0.1 + 0.2 === 0.30000000000000004），是"答案 100% 正确"的保证。
 */
function genDecimal(spec, rng) {
  const scale = 10 ** spec.scale;

  for (let i = 0; i < 200; i++) {
    const ai = rng.int(Math.round(spec.a.min * scale), Math.round(spec.a.max * scale));
    const bi = rng.int(Math.round(spec.b.min * scale), Math.round(spec.b.max * scale));
    const isAdd = rng.bool(0.5);

    const ri = isAdd ? ai + bi : ai - bi;
    if (ri < 0) continue;

    const answer = formatScaled(ri, scale);
    if (!inRange(Number(answer), spec.result)) continue;

    const a = formatScaled(ai, scale);
    const b = formatScaled(bi, scale);
    const op = isAdd ? 'add' : 'sub';

    return {
      op, kind: 'decimal', a, b, answer,
      params: { op, a, b, result: Number(answer),
                scale: spec.scale, kind: 'decimal',
                digits: digits(Math.trunc(ai / scale)) }
    };
  }
  return null;
}

/* ================================================================== *
 * 题型渲染
 * ================================================================== */

/**
 * 把原始数值加工为完整题目（确定题型、渲染题干、按题型调整答案）
 */
function finalize(raw, kp, type, rng) {
  const q = {
    kpId: kp.id,
    difficulty: kp.difficulty,
    kind: raw.kind,
    op: raw.op,
    type,
    a: raw.a, b: raw.b, denom: raw.denom,
    answer: raw.answer,
    params: { ...raw.params }
  };

  switch (type) {
    case 'compare': {
      if (raw.op === 'compare') {
        q.text = `${raw.a}  ○  ${raw.b}`;
        q.answer = raw.answer;
      } else {
        // 把算式的结果与一个"贴近值"比较，让题目有实际意义
        const ref = makeCompareRef(Number(raw.params.result), rng);
        q.compareTo = ref;
        q.text = `${exprText(q)}  ○  ${ref}`;
        q.answer = raw.params.result > ref ? '>'
                 : (raw.params.result < ref ? '<' : '=');
        q.kind = 'sign';
        q.params.compareTo = ref;
      }
      break;
    }

    case 'fill': {
      const hide = rng.pick(['a', 'b', 'result']);
      q.hide = hide;
      q.text = fillText(q, hide);
      q.answer = hide === 'result' ? raw.answer
               : hide === 'a' ? String(raw.a)
               : String(raw.b);
      q.params.hide = hide;
      break;
    }

    case 'vertical':
      q.text = `${exprText(q)} = ___`;              // 供无障碍朗读
      q.layout = buildVerticalLayout(q);
      q.answer = raw.answer;
      break;

    case 'chain':
      q.text = `${exprText(q)} = ___`;
      q.answer = raw.answer;
      break;

    case 'horizontal':
    default:
      q.text = `${exprText(q)} = ___`;
      q.answer = raw.answer;
  }

  return q;
}

/** 算式文本（不含等号与作答位） */
function exprText(q) {
  const p = q.params;

  if (q.op === 'compare') return `${p.a}  ○  ${p.b}`;

  if (q.op === 'mix') {
    const inner = `${p.a} ${p.op1} ${p.b}`;
    return p.paren ? `(${inner}) ${p.op2} ${p.c}`
                   : `${inner} ${p.op2} ${p.c}`;
  }

  if (q.kind === 'fraction') {
    return `${p.a}/${p.denom} ${SIGN[q.op]} ${p.b}/${p.denom}`;
  }

  return `${p.a} ${SIGN[q.op]} ${p.b}`;
}

/** 填空题文本 */
function fillText(q, hide) {
  const p = q.params;

  if (q.op === 'mix') {
    const inner = `${p.a} ${p.op1} ${p.b}`;
    const full = p.paren ? `(${inner}) ${p.op2} ${p.c}`
                         : `${inner} ${p.op2} ${p.c}`;
    return hide === 'result' ? `${full} = ___` : `${full} = ${p.result}`;
  }

  if (q.kind === 'fraction') {
    const L = `${p.a}/${p.denom}`;
    const R = `${p.b}/${p.denom}`;
    if (hide === 'a') return `□/${p.denom} ${SIGN[q.op]} ${R} = ${q.answer}`;
    if (hide === 'b') return `${L} ${SIGN[q.op]} □/${p.denom} = ${q.answer}`;
    return `${L} ${SIGN[q.op]} ${R} = ___`;
  }

  if (hide === 'a')      return `□ ${SIGN[q.op]} ${p.b} = ${q.answer}`;
  if (hide === 'b')      return `${p.a} ${SIGN[q.op]} □ = ${q.answer}`;
  return `${p.a} ${SIGN[q.op]} ${p.b} = ___`;
}

/** 为比较大小题造一个贴近结果的参照数 */
function makeCompareRef(result, rng) {
  const deltas = [0, 0, 1, -1, 2, -2, 5, -5, 10, -10];
  const ref = result + rng.pick(deltas);
  return ref < 0 ? result + Math.abs(rng.pick(deltas) || 1) : ref;
}

/**
 * 竖式版式数据
 * @returns {{rows:string[], width:number, answerDigits:number, plain:boolean}}
 */
export function buildVerticalLayout(q) {
  const p = q.params;

  // 混合运算没有竖式形态，退化为一行显示
  if (q.op === 'mix') {
    return { rows: [exprText(q)], width: 0, answerDigits: 0, plain: true };
  }

  const top = q.kind === 'fraction' ? `${p.a}/${p.denom}` : String(p.a);
  const bot = q.kind === 'fraction' ? `${p.b}/${p.denom}` : String(p.b);

  const width = Math.max(top.length, bot.length) + 1;
  const pad = (s) => ' '.repeat(width - s.length) + s;

  return {
    rows: [pad(top), pad(`${SIGN[q.op]}${bot}`)],
    width,
    // 作答行需要几格（按答案位数，至少与算式等宽）
    answerDigits: Math.max(String(q.answer).replace(/\D/g, '').length, 2),
    plain: false
  };
}

/* ================================================================== *
 * 难度调整
 * ================================================================== */

/**
 * 按难度档位收窄或放宽取值范围。
 *   easy   取区间下部 60%，并取消进位 / 退位要求
 *   normal 使用原始约束
 *   hard   取区间上部 70%，并强制进位 / 退位
 *
 * 注意：始终在原区间内取值，因此**不会超纲**。
 */
export function adjustSpec(spec, difficulty) {
  if (!difficulty || difficulty === 'normal') return spec;

  const out = { ...spec };

  if (difficulty === 'easy') {
    for (const key of ['a', 'b', 'c']) {
      if (out[key]) out[key] = lowerPart(out[key], 0.6);
    }
    if (out.quotient) out.quotient = lowerPart(out.quotient, 0.6);
    if (out.carry === true) out.carry = false;
    if (out.borrow === true) out.borrow = false;
    if (out.quotientHasZero) delete out.quotientHasZero;
    return out;
  }

  if (difficulty === 'hard') {
    for (const key of ['a', 'b', 'c']) {
      if (out[key]) out[key] = upperPart(out[key], 0.7);
    }
    if (out.quotient) out.quotient = upperPart(out.quotient, 0.7);
    if (out.carry === false) out.carry = true;
    if (out.borrow === false) out.borrow = true;
    return out;
  }

  return spec;
}

/** 取区间下部 p 比例 */
function lowerPart(r, p) {
  const span = r.max - r.min;
  return { min: r.min, max: Math.max(r.min, Math.round(r.min + span * p)) };
}

/** 取区间上部 p 比例 */
function upperPart(r, p) {
  const span = r.max - r.min;
  return { min: Math.max(r.min, Math.round(r.min + span * (1 - p))), max: r.max };
}

/* ================================================================== *
 * 去重
 * ================================================================== */

/**
 * 生成去重键。
 *
 * @param {Question} q
 * @param {boolean} commutative 是否把交换律视为同一题
 *        加法和乘法满足交换律，37+25 与 25+37 在教学上算同一道题
 *        （与需求评审结论 P-10 一致）。
 *
 * @returns {string}
 */
export function dedupeKey(q, commutative = true) {
  const p = q.params ?? {};

  if (q.op === 'compare') {
    return `${q.kpId}|cmp|${p.a},${p.b}`;
  }

  if (q.op === 'mix') {
    return `${q.kpId}|mix|${p.a},${p.b},${p.c},${p.op1}${p.op2}${p.paren ? 'p' : ''}`;
  }

  if (q.kind === 'fraction') {
    const [x, y] = commutative && q.op === 'add'
      ? [Math.min(p.a, p.b), Math.max(p.a, p.b)]
      : [p.a, p.b];
    return `${q.kpId}|frac|${q.op}|${x},${y}/${p.denom}`;
  }

  const swap = commutative && (q.op === 'add' || q.op === 'mul');
  const x = Number(p.a);
  const y = Number(p.b);

  return swap
    ? `${q.kpId}|${q.op}|${Math.min(x, y)},${Math.max(x, y)}`
    : `${q.kpId}|${q.op}|${x},${y}`;
}

/* ================================================================== *
 * 小工具
 * ================================================================== */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const inRange = (v, r) => !r || (v >= r.min && v <= r.max);

const digits = (n) => String(Math.abs(Math.trunc(n))).length;

/** 按 step 取操作数（整十数 / 整百数），无 step 则普通取整 */
function pickOperand(range, step, rng) {
  if (!step) return rng.int(range.min, range.max);
  return rng.multiple(range.min, range.max, step);
}

/** 求值；除法必须整除，否则返回 null */
function apply(op, x, y) {
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '×': case '*': return x * y;
    case '÷': case '/': return (y !== 0 && x % y === 0) ? x / y : null;
    default:  return null;
  }
}

/** 把 total 均分为 n 份，余数补给靠前的 */
function distribute(total, n) {
  const base = Math.floor(total / n);
  const rest = total % n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** 取知识点支持、且用户勾选了的题型；交集为空则回退到该知识点的全部题型 */
function intersectTypes(kpTypes, wanted) {
  const inter = (wanted ?? []).filter((t) => kpTypes.includes(t));
  return inter.length ? inter : kpTypes.slice();
}
