import { el } from '../../utils/dom.js';
import { formatDuration } from '../../utils/format.js';
import { go } from '../../core/router.js';
import { resumeSession, saveDraft, recordAttempt, advance, finishSession,
  discardSession, elapsedMs, expired, savedDurably } from '../../app/quizSession.js';
import { mountKeypad } from '../components/keypad.js';
import { icon } from '../components/icon.js';

export function renderQuiz(root, ctx) {
  let autoNext = null, ticker = null, disposed = false, retrying = false;
  const initial = resumeSession();
  const clearAuto = () => { clearTimeout(autoNext); autoNext = null; };
  function empty() {
    root.replaceChildren(el('section', { class: 'card' }, [
      el('h1', { text: '还没有进行中的练习' }),
      el('a', { class: 'btn btn-primary', href: '#/practice', text: '去出题' })
    ]));
  }
  function finish(reason) {
    clearAuto();
    clearInterval(ticker);
    const result = finishSession(reason);
    go(result ? '/result' : '/home');
  }
  function next() {
    clearAuto();
    if (!resumeSession()) return;
    retrying = false;
    if (advance()) go('/result');
    else draw();
  }
  function tick() {
    const s = resumeSession();
    if (!s || disposed) return;
    if (expired(s)) { finish('timeout'); return; }
    const label = root.querySelector('[data-timer]');
    if (label) label.textContent = `已用 ${formatDuration(elapsedMs(s))}`
      + (s.limitMs === null ? '' : ` · 剩余 ${formatDuration(Math.max(0, s.limitMs - elapsedMs(s)))}`);
  }
  function exit() {
    clearAuto();
    const dialog = el('dialog', { class: 'confirm-dialog', 'aria-labelledby': 'exit-title' }, [
      el('h2', { id: 'exit-title', text: '结束本次练习？' }),
      el('p', { text: '已答题会结算，剩余题记为未作答。' }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn', text: '继续答题', onclick: () => { dialog.close(); dialog.remove(); draw(); } }),
        el('button', { class: 'btn btn-primary', text: '确认结束', onclick: () => { dialog.close(); dialog.remove(); finish('exit'); } })
      ])
    ]);
    root.append(dialog);
    dialog.addEventListener('cancel', () => { dialog.remove(); draw(); });
    dialog.showModal();
  }
  function draw() {
    clearAuto();
    const s = resumeSession();
    if (!s) { empty(); return; }
    if (expired(s)) { finish('timeout'); return; }
    const q = s.paper.questions[s.cursor];
    const first = s.attempts[q.id], correction = s.retries[q.id];
    const feedback = correction ?? first;
    const editing = !first || retrying;
    const status = el('p', { class: 'answer-feedback', role: 'status', 'aria-live': 'polite' });
    const input = el('input', { id: 'quiz-answer', class: 'answer-input', type: 'text',
      inputmode: matchMedia('(pointer: coarse)').matches ? 'none' : 'text',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      maxlength: 40, 'aria-describedby': 'answer-hint' });
    input.value = editing ? s.draft : feedback.userAnswer;
    input.disabled = !editing;
    const error = el('p', { class: 'warn-text', role: 'alert' });
    const warnSave = () => {
      if (!savedDurably()) error.textContent = '进度暂存在当前页面，关闭或刷新可能丢失。';
    };
    function submit(skip = false) {
      if (!editing) return;
      try {
        const a = recordAttempt(input.value, { retry: retrying, skip });
        if (a.timedOut) { finish('timeout'); return; }
        retrying = false;
        draw();
      } catch (e) { error.textContent = e.message; }
    }
    input.addEventListener('input', () => {
      saveDraft(input.value);
      warnSave();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing && !e.repeat) { e.preventDefault(); submit(); }
    });
    if (feedback && !retrying) {
      status.classList.add(feedback.correct ? 'is-correct' : 'is-wrong');
      status.textContent = feedback.skipped ? '已跳过，本题记为未作答。'
        : feedback.correct ? (correction ? '✓ 订正正确！首次成绩保留。' : '✓ 答对了！')
          : `✗ ${correction ? '再练练，' : ''}正确答案是 ${feedback.expected}`;
    } else if (retrying) status.textContent = '再试一次；首次成绩不会改变。';
    const actions = editing ? [
      el('button', { class: 'btn btn-primary', text: '提交答案', onclick: () => submit() }),
      retrying ? el('button', { class: 'btn', text: '不再订正', onclick: () => { retrying = false; draw(); } })
        : el('button', { class: 'btn', text: '跳过', onclick: () => submit(true) })
    ] : [
      el('button', { class: 'btn btn-primary', text: s.cursor === s.paper.questions.length - 1 ? '查看成绩' : '下一题', onclick: next }),
      first && !first.correct && !first.skipped && !correction ? el('button', {
        class: 'btn', text: '再试一次', onclick: () => { retrying = true; draw(); }
      }) : null
    ];
    root.replaceChildren(el('section', { class: 'page quiz-page' }, [
      el('div', { class: 'row-between quiz-heading' }, [
        el('div', {}, [el('span', { class: 'eyebrow' }, [icon('leaf'), '专注的小小时间']),
          el('h1', { text: '口算练习' }), el('p', { class: 'muted', text: '慢慢想，你一定可以。' })]),
        el('button', { class: 'link-btn', text: '退出练习', onclick: exit })
      ]),
      el('div', { class: 'paper-meta quiz-meta' }, [
        el('span', { class: 'progress-label', text: `第 ${s.cursor + 1} / 共 ${s.paper.questions.length} 题` }),
        el('span', { class: 'timer-label' }, [icon('clock'), el('span', { 'data-timer': '', role: 'timer' })])
      ]),
      el('progress', { class: 'quiz-progress', max: s.paper.questions.length, value: s.cursor,
        'aria-label': '已完成题数' }),
      el('section', { class: 'card quiz-card' + (feedback && !editing ? ' has-feedback' : '') }, [
        el('div', { class: 'quiz-problem' }, [
        el('span', { class: 'question-tag', text: `QUESTION ${String(s.cursor + 1).padStart(2, '0')}` }),
        el('h2', { class: 'quiz-question', text: q.text }),
        q.type === 'vertical' && q.layout?.rows ? el('pre', { class: 'vertical-question', text: q.layout.rows.join('\n') + '\n' + '─'.repeat(Math.max(4, q.layout.width || 4)) }) : null,
        el('label', { for: 'quiz-answer', class: 'field-label', text: '你的答案' }), input,
        el('p', { id: 'answer-hint', class: 'muted small', text: q.kind === 'fraction' ? '分数写成 1/2；可以用下面的键盘。'
          : q.type === 'compare' ? '输入 <、> 或 =。' : q.params?.rem ? '有余数时写成 9余2。' : '输入答案，按回车或点击提交。' }),
        status, error]),
        el('div', { class: 'quiz-controls' }, [
        el('div', { class: 'keypad-caption' }, [icon('grid'), editing ? '敲下你的答案' : '每一步，都算进步']),
        el('div', { class: 'actions quiz-actions' }, actions),
        mountKeypad(input, value => { saveDraft(value); warnSave(); })
        ])
      ])
    ]));
    warnSave();
    tick();
    if (editing && matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
    if (feedback?.correct && !editing) autoNext = setTimeout(next, 700);
  }
  function begin() {
    draw();
    if (resumeSession()) ticker = setInterval(tick, 500);
  }
  if (!initial) empty();
  else if (ctx.query.get('start') === '1') {
    window.history.replaceState(null, '', '#/quiz');
    begin();
  } else {
    root.replaceChildren(el('section', { class: 'card' }, [
      el('h1', { text: '继续上次练习？' }),
      el('p', { text: `已保留第 ${initial.cursor + 1} / ${initial.paper.questions.length} 题的进度。计时包含离开页面的时间。` }),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn-primary', text: '继续练习', onclick: begin }),
        el('button', { class: 'btn', text: '放弃练习', onclick: () => {
          if (window.confirm('放弃本次练习？未结算的进度将被删除。')) { discardSession(); go('/home'); }
        } })
      ])
    ]));
  }
  return { dispose() { disposed = true; clearAuto(); clearInterval(ticker); },
    beforeLeave() { return !resumeSession() || window.confirm('离开答题页？进度已暂存，可回首页继续练习。'); } };
}
