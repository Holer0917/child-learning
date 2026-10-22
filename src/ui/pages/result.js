import { el } from '../../utils/dom.js';
import { humanDuration, formatAccuracy } from '../../utils/format.js';
import { getKnowledgePoint } from '../../domain/syllabus.js';
import { getLastResult } from '../../app/quizSession.js';

export function renderResult(root) {
  const r = getLastResult();
  if (!r) {
    root.replaceChildren(el('section', { class: 'card' }, [
      el('h1', { text: '还没有练习成绩' }),
      el('a', { class: 'btn btn-primary', href: '#/home', text: '去出题' })
    ]));
    return;
  }
  const counts = {};
  for (const q of r.paper.questions) counts[q.kpId] = (counts[q.kpId] ?? 0) + 1;
  const metric = (label, value) => el('div', { class: 'metric' }, [
    el('strong', { text: String(value) }), el('span', { text: label })
  ]);
  root.replaceChildren(el('section', { class: 'page result-page' }, [
    el('header', { class: 'page-head' }, [
      el('h1', { text: r.reason === 'timeout' ? '时间到，来看看成绩' : '本次练习完成' }),
      el('p', { class: 'muted', text: '成绩按每题首次作答计算，订正不会覆盖首次结果。' })
    ]),
    r.saved === false ? el('p', { class: 'alert', role: 'alert', text: '成绩未能完整保存到浏览器，请先保留本页。' }) : null,
    el('section', { class: 'card score-card' }, [
      el('div', { class: 'score', text: formatAccuracy(r.accuracy) }),
      el('h2', { text: r.grade.label }), el('p', { text: r.grade.tip }),
      el('div', { class: 'metrics' }, [metric('正确', r.correct), metric('错误', r.wrong), metric('未作答', r.skipped)]),
      el('p', { class: 'muted', text: `共 ${r.total} 题 · 总用时 ${humanDuration(r.elapsedMs)} · 平均每题 ${r.avgMs == null ? '—' : humanDuration(r.avgMs)}` })
    ]),
    el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: '本次练习内容' }),
      el('ul', {}, Object.entries(counts).map(([id, n]) => el('li', {
        text: `${getKnowledgePoint(id)?.name ?? id}：${n} 题`
      })))
    ]),
    el('section', { class: 'card' }, [el('h2', { class: 'card-title', text: `答错的题 · ${r.wrong} 道` }),
      r.wrongList.length ? el('ol', { class: 'review-list' }, r.wrongList.map(w => el('li', {}, [
        el('p', { class: 'review-question', text: w.question.text }),
        el('p', { text: `你的答案：${w.userAnswer}；正确答案：${w.expected}` })
      ]))) : el('p', { text: r.skipped ? '已作答的题目全部答对，记得留意未作答的题。' : '全部答对，真棒！' })
    ]),
    el('a', { class: 'btn btn-primary btn-block', href: '#/home', text: '再出一份题' })
  ]));
}
