/**
 * 出题台（首页）
 *
 * 只负责：收集参数 → 调用出题引擎 → 展示结果。
 * 业务规则（钳制、默认知识点、去重）全部在 domain 层。
 */

import { el } from '../../utils/dom.js';
import { bus, EVENTS } from '../../core/bus.js';
import { getActiveProfile } from '../../domain/profile.js';
import {
  GRADES, QUESTION_TYPES, groupByGrade, getGradeDefaultKPs
} from '../../domain/syllabus.js';
import { generatePaper } from '../../domain/generator.js';
import { go } from '../../core/router.js';
import { createSession, resumeSession, discardSession } from '../../app/quizSession.js';
import { icon } from '../components/icon.js';

const DIFFICULTIES = [
  { id: 'easy', name: '简单', desc: '更基础' },
  { id: 'normal', name: '适中', desc: '按教材' },
  { id: 'hard', name: '挑战', desc: '更有难度' }
];

const COUNTS = [10, 20, 30, 50];

/** 页面内状态（不持久化，刷新即重置） */
const state = {
  grade: 1,
  kpIds: [],
  count: 30,
  difficulty: 'normal',
  types: [],
  paper: null,
  error: '',
  elapsed: 0,
  limitMinutes: 0
};

export function renderPractice(root) {
  const profile = getActiveProfile();
  state.grade = profile?.grade ?? 1;
  state.kpIds = getGradeDefaultKPs(state.grade);
  state.count = 30;
  state.difficulty = 'normal';
  state.types = ['horizontal'];
  state.paper = null;
  state.error = '';
  state.limitMinutes = 0;

  paint(root);
}

function paint(root) {
  root.replaceChildren(
    el('section', { class: 'page page-home' }, [
      el('header', { class: 'page-head' }, [
        el('h1', { text: '出题练习' }),
        el('p', { class: 'muted', text: '选择年级、知识点、题量与题型，生成练习题。' })
      ]),
      resumeBlock(root),
      el('div', { class: 'home-workspace' }, [
        el('div', { class: 'knowledge-column' }, [
          card('选择年级', gradeRow(root), '01', '支持小学 1–3 年级'),
          card('选择知识点', pointBlock(root), '02', '可选择多个知识点')
        ]),
        el('aside', { class: 'settings-column', 'aria-label': '练习设置' }, [
          card('练习设置', [optionBlock(root),
            el('div', { class: 'practice-summary' }, [
              el('div', { class: 'summary-icon' }, icon('book')),
              el('div', {}, [el('strong', { text: `今天，练 ${state.count} 道` }),
                el('p', { text: `${GRADES.find(g => g.id === state.grade).name} · ${state.kpIds.length} 个知识点` })])
            ]), errorBlock(root), generateBar(root),
            el('p', { class: 'settings-note' }, [icon('leaf'), '不用赶时间，认真做好每一道。'])
          ], '03', '设置题量、难度、题型及倒计时')
        ])
      ]),
      state.paper ? paperBlock(root) : null
    ].filter(Boolean))
  );
}

/* ------------------------------------------------------------------ *
 * 区块
 * ------------------------------------------------------------------ */

function card(title, body, step, description) {
  return el('section', { class: 'card' }, [
    el('div', { class: 'card-heading' }, [
      step ? el('span', { class: 'step-number', text: step }) : icon('clock', 'resume-icon'),
      el('div', {}, [el('h2', { class: 'card-title', text: title }),
        description ? el('p', { class: 'card-description', text: description }) : null])
    ]),
    ...(Array.isArray(body) ? body : [body])
  ]);
}

function resumeBlock(root) {
  const session = resumeSession();
  if (!session) return null;
  return card('还有一份未完成的练习', el('div', {}, [
    el('p', { text: `进度：第 ${session.cursor + 1} / ${session.paper.questions.length} 题` }),
    el('div', { class: 'actions' }, [
      el('a', { class: 'btn btn-primary', href: '#/quiz', text: '继续练习' }),
      el('button', { class: 'btn', text: '放弃上次练习', onclick: () => {
        if (window.confirm('放弃上次练习？未结算的进度将被删除。')) { discardSession(); paint(root); }
      } })
    ])
  ]));
}

function gradeRow(root) {
  const notes = ['打好计算基础', '乘除法小进阶', '探索更多运算'];
  return el('div', { class: 'chips grade-options' }, GRADES.map((g) =>
    el('button', {
      class: 'chip' + (g.id === state.grade ? ' is-active' : ''),
      type: 'button',
      'aria-pressed': g.id === state.grade ? 'true' : 'false',
      'aria-label': g.name,
      onclick: () => {
        if (g.id === state.grade) return;
        state.grade = g.id;
        state.kpIds = getGradeDefaultKPs(g.id);
        state.paper = null;
        state.error = '';
        paint(root);
      }
    }, [el('span', { class: 'grade-number', text: String(g.id) }),
      el('span', { class: 'grade-option-copy' }, [el('strong', { text: g.name }),
        el('span', { text: notes[g.id - 1] })])])
  ));
}

function pointBlock(root) {
  const groups = groupByGrade().filter((g) => g.id === state.grade);
  const allSelected = groups[0].points.every((p) => state.kpIds.includes(p.id));

  return el('div', {}, [
    el('div', { class: 'row-between' }, [
      el('span', { class: 'selection-count', text: `已选 ${state.kpIds.length} / ${groups[0].points.length} 个` }),
      el('button', {
        class: 'link-btn',
        type: 'button',
        text: allSelected ? '全不选' : '全选',
        onclick: () => {
          state.kpIds = allSelected ? [] : groups[0].points.map((p) => p.id);
          state.paper = null;
          paint(root);
        }
      })
    ]),
    el('ul', { class: 'kp-list' }, groups[0].points.map((kp) => {
      const checked = state.kpIds.includes(kp.id);
      return el('li', {}, [
        el('label', { class: 'kp-item' + (checked ? ' is-checked' : '') }, [
          el('input', {
            type: 'checkbox',
            checked,
            onchange: (e) => {
              state.kpIds = e.target.checked
                ? [...state.kpIds, kp.id]
                : state.kpIds.filter((id) => id !== kp.id);
              state.paper = null;
              paint(root);
            }
          }),
          el('span', { class: 'kp-copy' }, [
            el('span', { class: 'kp-name', text: kp.name }),
            el('span', { class: 'kp-level' }, [
              el('span', { class: 'kp-star', text: '★'.repeat(kp.difficulty) }),
              el('span', { text: ['基础巩固', '进阶练习', '小小挑战'][kp.difficulty - 1] })
            ])
          ])
        ])
      ]);
    }))
  ]);
}

function optionBlock(root) {
  return el('div', {}, [
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: '题量' }),
      el('div', { class: 'chips count-options' }, COUNTS.map((n) =>
        el('button', {
          class: 'chip' + (n === state.count ? ' is-active' : ''),
          type: 'button',
          text: String(n),
          'aria-pressed': n === state.count ? 'true' : 'false',
          onclick: () => {
            state.count = n;
            state.paper = null;
            paint(root);
          }
        })
      ))
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: '难度' }),
      el('div', { class: 'chips difficulty-options' }, DIFFICULTIES.map((d) =>
        el('button', {
          class: 'chip' + (d.id === state.difficulty ? ' is-active' : ''),
          type: 'button',
          'aria-label': d.name,
          'aria-pressed': d.id === state.difficulty ? 'true' : 'false',
          onclick: () => {
            state.difficulty = d.id;
            state.paper = null;
            paint(root);
          }
        }, [el('strong', { text: d.name }), el('span', { text: d.desc })])
      ))
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: '题型（可多选）' }),
      el('div', { class: 'chips type-options' }, QUESTION_TYPES.map((t) =>
        el('button', {
          class: 'chip' + (state.types.includes(t.id) ? ' is-active' : ''),
          type: 'button',
          text: t.name,
          'aria-pressed': state.types.includes(t.id) ? 'true' : 'false',
          onclick: () => {
            state.types = state.types.includes(t.id)
              ? state.types.filter((x) => x !== t.id)
              : [...state.types, t.id];
            if (state.types.length === 0) state.types = [t.id]; // 至少保留一种
            state.paper = null;
            paint(root);
          }
        })
      ))
    ]),
    el('div', { class: 'field timer-field' }, [
      el('label', { class: 'field-label', for: 'limit-minutes' }, [icon('clock'), '倒计时（可选）']),
      el('select', { id: 'limit-minutes', class: 'time-select', onchange: e => {
        state.limitMinutes = Number(e.target.value);
      } }, [0, ...Array.from({ length: 60 }, (_, i) => i + 1)].map(n => el('option', {
        value: n, selected: state.limitMinutes === n, text: n ? `${n} 分钟` : '不限时，慢慢来'
      })))
    ])
  ]);
}

function errorBlock(root) {
  if (!state.error) return null;
  return el('p', { class: 'alert', role: 'alert', text: state.error });
}

function generateBar(root) {
  return el('div', { class: 'sticky-bar' }, [
    el('span', { class: 'cta-context' }, [el('strong', { text: `${state.count} 道题` }),
      el('small', { text: `${state.kpIds.length} 个知识点已选` })]),
    el('button', {
      class: 'btn btn-primary btn-block',
      type: 'button',
      'aria-label': `开始出题 · ${state.count} 道`,
      onclick: () => generate(root)
    }, [icon('spark'), `开始出题 · ${state.count} 道`, icon('arrow')])
  ]);
}

/* ------------------------------------------------------------------ *
 * 出题
 * ------------------------------------------------------------------ */

function generate(root) {
  state.error = '';

  if (state.kpIds.length === 0) {
    state.error = '请至少选择一个知识点';
    paint(root);
    return;
  }

  const started = performance.now();
  try {
    state.paper = generatePaper({
      kpIds: state.kpIds,
      count: state.count,
      difficulty: state.difficulty,
      types: state.types
    });
    state.elapsed = performance.now() - started;
  } catch (err) {
    console.error('[home] 出题失败：', err);
    state.paper = null;
    state.error = '当前条件下无法出题，请调整知识点、难度或题型。';
  }

  paint(root);
  if (state.paper) {
    bus.emit(EVENTS.PAPER_GENERATED, { paperId: state.paper.id });
    document.querySelector('.paper-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ------------------------------------------------------------------ *
 * 结果
 * ------------------------------------------------------------------ */

function paperBlock(root) {
  const paper = state.paper;
  const actual = paper.questions.length;
  const stars = paper.questions.map((q) => q.difficulty);
  const avg = stars.length ? (stars.reduce((a, b) => a + b, 0) / stars.length) : 0;

  return el('section', { class: 'card paper-block' }, [
    el('div', { class: 'row-between' }, [
      el('h2', { class: 'card-title' }, [icon('book'), '本次题目']),
      el('span', { class: 'ready-badge' }, [icon('check'), '准备好啦'])
    ]),

    el('p', { class: 'paper-meta' }, [
      el('span', { text: `共 ${actual} 道` }),
      el('span', { text: `平均难度 ${avg.toFixed(1)} 星` }),
      paper.shortfall > 0
        ? el('span', { class: 'warn-text', text: `已接近上限，少出 ${paper.shortfall} 道` })
        : null
    ].filter(Boolean)),

    el('button', { class: 'btn btn-primary btn-block', 'aria-label': '开始答题', disabled: actual === 0,
      onclick: () => {
        if (resumeSession()) {
          state.error = '请先继续或放弃上次练习，再开始新练习。';
          paint(root);
          return;
        }
        try {
          createSession(paper, { limitMs: state.limitMinutes ? state.limitMinutes * 60000 : null });
          go('/quiz?start=1');
        } catch (e) { state.error = e.message; paint(root); }
      }
    }, ['开始答题', icon('arrow')]),

    el('ol', { class: 'question-list' }, paper.questions.map((q) =>
      el('li', { class: 'question-item' }, [
        el('span', { class: 'q-text', text: q.text }),
        el('span', { class: 'q-star', text: '★'.repeat(q.difficulty) })
      ])
    ))
  ]);
}
