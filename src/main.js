/**
 * 应用入口
 *
 * 启动顺序（对应设计说明书 §2.3）：
 *   1. 存储版本迁移
 *   2. 确保存在当前档案
 *   3. 注册路由并挂载
 */

import { migrate, isAvailable } from './core/storage.js';
import { ensureProfile, getActiveProfile } from './domain/profile.js';
import { start, register, registerFallback } from './core/router.js';
import { renderHome } from './ui/pages/home.js';
import { renderQuiz } from './ui/pages/quiz.js';
import { renderResult } from './ui/pages/result.js';
import { el } from './utils/dom.js';

function boot() {
  const mount = document.getElementById('app');
  const header = document.getElementById('topbar');

  // 1. 迁移 + 建档
  migrate();
  ensureProfile();

  // 2. 顶栏：档案信息（切换功能后续补）
  const profile = getActiveProfile();
  header.replaceChildren(
    el('div', { class: 'brand' }, [
      el('span', { class: 'brand-mark', text: '🧮' }),
      el('span', { class: 'brand-name', text: '口算小达人' })
    ]),
    el('div', { class: 'profile-chip' }, [
      el('span', { text: profile?.avatar ?? '🙂' }),
      el('span', { text: profile?.name ?? '小朋友' }),
      el('span', { class: 'grade-tag', text: `${profile?.grade ?? 1} 年级` })
    ])
  );

  // 3. 存储不可用时给出提示（FM-01）
  if (!isAvailable()) {
    mount.before(el('div', { class: 'alert alert-banner', role: 'alert' },
      '当前浏览器不支持本地存储，本次数据关闭页面后会丢失。'));
  }

  // 4. 路由
  register('/home', (root) => renderHome(root), '出题');
  register('/quiz', renderQuiz, '答题');
  register('/result', renderResult, '成绩');
  registerFallback((root, ctx) => {
    root.replaceChildren(
      el('p', { class: 'empty', text: `页面不存在：${ctx.path}` }),
      el('a', { class: 'btn btn-primary', href: '#/home', text: '回到首页' })
    );
  });

  start(mount);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
