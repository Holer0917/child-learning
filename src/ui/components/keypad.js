import { el } from '../../utils/dom.js';

/** 追加到输入框，不抢走输入焦点；物理键盘依赖原生 input。 */
export function mountKeypad(input, onChange) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫', '/', '余', '-', '<', '=', '>'];
  return el('div', { class: 'keypad', 'aria-label': '答题键盘' }, keys.map(key =>
    el('button', { type: 'button', class: 'btn key', text: key, disabled: input.disabled,
      'aria-label': key === '⌫' ? '删除一位' : key,
      onpointerdown: e => e.preventDefault(),
      onclick: () => {
        if (input.disabled) return;
        const a = input.selectionStart ?? input.value.length;
        const b = input.selectionEnd ?? a;
        const start = key === '⌫' && a === b ? Math.max(0, a - 1) : a;
        const insert = key === '⌫' ? '' : key;
        const next = input.value.slice(0, start) + insert + input.value.slice(b);
        if (next.length > 40) return;
        input.value = next;
        input.focus({ preventScroll: true });
        input.setSelectionRange(start + insert.length, start + insert.length);
        onChange(input.value);
      }
    })
  ));
}
