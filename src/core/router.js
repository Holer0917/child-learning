/**
 * 哈希路由
 *
 * 采用 `#/path` 而非 History API：静态托管（Gitee Pages）无需服务端重写规则，
 * 刷新任意页面都不会 404。详见设计说明书 D-3。
 */

/** @type {Map<string, {render: Function, title?: string}>} */
const routes = new Map();

let container = null;
let notFound = null;
let current = '';

/** 当前页面路径，形如 `/home` */
export function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return normalize(hash || '/home');
}

/** 统一成 `/xxx` 形式，去掉尾部斜杠 */
function normalize(path) {
  const p = '/' + path.replace(/^\/+/, '').replace(/\/+$/, '');
  return p === '/' ? '/' : p;
}

/**
 * 注册路由
 * @param {string} path
 * @param {(el: HTMLElement, ctx: {path: string, query: URLSearchParams}) => void} render
 */
export function register(path, render, title) {
  routes.set(normalize(path), { render, title });
}

/** 注册兜底页面 */
export function registerFallback(render) {
  notFound = render;
}

/** 跳转 */
export function go(path) {
  const target = '#' + normalize(path);
  if (window.location.hash === target) render();
  else window.location.hash = target;
}

/** 解析 `?a=1` 查询串 */
function parseQuery(path) {
  const i = path.indexOf('?');
  return i < 0 ? new URLSearchParams() : new URLSearchParams(path.slice(i + 1));
}

/** 渲染当前路由 */
function render() {
  if (!container) return;

  const path = currentPath();
  current = path;

  container.replaceChildren();
  container.scrollTop = 0;

  const route = routes.get(path);
  const ctx = { path, query: parseQuery(path) };

  if (!route) {
    if (notFound) notFound(container, ctx);
    else container.textContent = '页面不存在：' + path;
    return;
  }

  if (route.title) document.title = route.title + ' · 口算小达人';

  try {
    route.render(container, ctx);
  } catch (err) {
    // 页面级异常不应导致整站白屏（FM-11）
    console.error('[router] 页面渲染失败：', err);
    container.textContent = '出了点小问题，请刷新重试。';
  }
}

/**
 * 启动路由
 * @param {HTMLElement} el 挂载点
 */
export function start(el) {
  container = el;
  window.addEventListener('hashchange', render);
  if (!window.location.hash) {
    // 首次进入补一个默认 hash，保证地址栏可见、可分享
    window.history.replaceState(null, '', '#/home');
  }
  render();
}

/** 重新渲染当前页（档案切换后使用） */
export function refresh() {
  render();
}

export { current };
