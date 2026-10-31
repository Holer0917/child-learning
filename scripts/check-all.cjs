/** ABC：统一复跑A/B/C专项与相关回归，保存真实机器输出；不发布、不读取日常浏览器档案。 */
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '');
const output = process.env.CHECK_OUTPUT ? path.resolve(root, process.env.CHECK_OUTPUT) : path.join(root, 'docs', '04-测试', 'evidence', 'ABC-integration-' + day);
const relative = file => path.relative(root, file).split(path.sep).join('/');
const digest = data => createHash('sha256').update(data).digest('hex');
const unitFiles = ['generator-options', 'paper-stats', 'paper-edit', 'quiz-session', 'history', 'mistakes-stats', 'profiles-backup'].map(name => `tests/${name}.test.mjs`);
const suites = [
  ['practice-wizard', 'tests/practice-wizard-browser.cjs', 'wizard-browser-results.json'],
  ['A-integration', 'tests/mistakes-browser.cjs', 'a-browser-results.json'],
  ['C-integration', 'tests/profiles-browser.cjs', 'c-browser-results.json'],
  ['B01', 'tests/practice-browser.cjs', 'b01-browser-results.json'],
  ['B02', 'tests/count-browser.cjs', 'b02-browser-results.json'],
  ['B03', 'tests/options-browser.cjs', 'b03-browser-results.json'],
  ['B04', 'tests/preview-browser.cjs', 'b04-browser-results.json'],
  ['B05', 'tests/paper-edit-browser.cjs', 'b05-browser-results.json'],
  ['B06', 'tests/mobile-quiz-browser.cjs', 'b06-browser-results.json'],
  ['B07', 'tests/keyboard-browser.cjs', 'b07-browser-results.json'],
  ['B08', 'tests/pwa-browser.cjs', 'b08-browser-results.json'],
  ['B09', 'tests/feedback-browser.cjs', 'b09-browser-results.json'],
  ['quiz-regression', 'tests/quiz-browser.cjs', 'step2-browser-results.json'],
  ['history-regression', 'tests/history-browser.cjs', 'history-checks.json']
];
async function walk(folder) {
  const files = [];
  for (const entry of await fs.readdir(path.join(root, folder), { withFileTypes: true })) {
    const name = folder + '/' + entry.name;
    if (entry.isDirectory()) files.push(...await walk(name)); else if (name.endsWith('.js')) files.push(name);
  }
  return files.sort();
}
async function hashes(files) {
  return Promise.all(files.map(async file => {
    const data = await fs.readFile(path.join(root, file));
    return { file, bytes: data.length, sha256: digest(data) };
  }));
}
async function run(id, args, env = {}) {
  const startedAt = new Date().toISOString(), start = performance.now();
  console.log(`RUN ${id}`);
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, timeout: 180000 });
    let stdout = '', stderr = '', error = null;
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', e => { error = e.message; });
    child.on('close', async (code, signal) => {
      try {
        const logFile = `${id}.log`, log = `command: node ${args.join(' ')}\nstartedAt: ${startedAt}\nexitCode: ${code}\nsignal: ${signal ?? ''}\n${error ? `error: ${error}\n` : ''}\nSTDOUT\n${stdout}\nSTDERR\n${stderr}`;
        await fs.writeFile(path.join(output, logFile), log);
        const result = { id, command: ['node', ...args], startedAt, durationMs: Math.round(performance.now() - start),
          exitCode: code, signal, error, status: code === 0 && !error ? 'passed' : 'failed',
          checkCount: stdout.split(/\r?\n/).filter(line => line.startsWith('PASS')).length, logFile };
        if (id === 'unit') result.unitCounts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key =>
          [key, Number(stdout.match(new RegExp(`^# ${key} (\\d+)`, 'm'))?.[1] ?? 0)]));
        console.log(`${result.status === 'passed' ? 'PASS' : 'FAIL'} ${id} (${result.durationMs}ms)`);
        resolve(result);
      } catch (e) { resolve({ id, status: 'failed', error: e.message, exitCode: code }); }
    });
  });
}

// 仅供旧历史回归脚本使用；随机端口、独立浏览器，不占用8765/8766。
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    let data = await fs.readFile(file);
    if (path.extname(file) === '.html') data = Buffer.from(data.toString().replace('</head>', '<meta name="kidsmath-development" content="true"></head>'));
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }).end(data);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});

(async () => {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('统一自测需要Node.js 22或更新版本。');
  const { chromium } = require('playwright');
  const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  await fs.access(edge);
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const probe = await chromium.launch({ headless: true, executablePath: edge });
  const browserVersion = await probe.version(); await probe.close();
  const runtimeFiles = ['index.html', 'manifest.webmanifest', 'sw.js', 'assets/css/base.css',
    'assets/icons/app-192.png', 'assets/icons/app-512.png', 'assets/icons/apple-touch-icon.png', ...await walk('src')].sort();
  const testedFiles = [...new Set([...runtimeFiles, ...unitFiles, ...suites.map(s => s[1]), 'authoring/practice.js', 'scripts/build-practice.py', 'tests/practice-navigation.cjs', 'tests/smoke.html', 'scripts/check-all.cjs'])].sort();
  const inputs = await hashes(testedFiles);
  const startedAt = new Date().toISOString(), results = [];
  results.push(await run('unit', ['--test', '--test-reporter=tap', ...unitFiles]));
  for (const [id, script, resultFile] of suites) {
    const result = await run(id, [script], { TEST_BASE_URL: base });
    const generated = path.join(root, '.tmp', resultFile);
    if (result.status === 'passed') {
      try {
        const data = await fs.readFile(generated), detail = JSON.parse(data.toString());
        if (!Number.isFinite(Date.parse(detail.executedAt)) || Date.parse(detail.executedAt) < Date.parse(result.startedAt)) throw new Error('结果时间不属于本次执行，拒绝沿用旧报告');
        if (!Array.isArray(detail.checks) || detail.checks.length !== result.checkCount || !detail.checks.every(line => line.startsWith('PASS'))) throw new Error('结果条数或状态与实际输出不符');
        const name = id + '-results.json'; await fs.writeFile(path.join(output, name), data);
        result.resultFile = name; result.resultSha256 = digest(data);
      } catch (e) { result.status = 'failed'; result.error = e.message; }
    }
    results.push(result);
  }
  const after = await hashes(testedFiles), unchanged = inputs.every((item, i) => item.sha256 === after[i].sha256);
  const staticFiles = inputs.filter(item => runtimeFiles.includes(item.file));
  const rawBytesExcludingImages = staticFiles.filter(item => !item.file.endsWith('.png')).reduce((sum, item) => sum + item.bytes, 0);
  const staticSizePassed = rawBytesExcludingImages <= 300000;
  const summary = { schemaVersion: 1, scope: '本地ABC集成自动验证；不等同于全部需求或真实手机最终验收',
    startedAt, finishedAt: new Date().toISOString(), timeZone: 'Asia/Shanghai', nodeVersion: process.version,
    platform: process.platform, browser: `Edge ${browserVersion}`, requirementBaseline: 'SRS V1.6', designBaseline: 'SDD V1.14',
    workerVersion: (await fs.readFile(path.join(root, 'sw.js'), 'utf8')).match(/const VERSION = '([^']+)'/)?.[1],
    status: results.every(r => r.status === 'passed') && unchanged && staticSizePassed ? 'passed' : 'failed',
    totals: { suites: results.length, passedSuites: results.filter(r => r.status === 'passed').length,
      browserCheckGroups: results.filter(r => r.id !== 'unit').reduce((sum, r) => sum + (r.checkCount ?? 0), 0), unit: results[0].unitCounts },
    staticSize: { rawBytesExcludingImages, limitBytes: 300000, method: 'UTF-8原文件字节；入口HTML、manifest、SW、CSS与全部运行JS；不含PNG、测试、文档、未引用素材；非gzip', passed: staticSizePassed },
    inputsUnchangedDuringRun: unchanged, inputs, results,
    notVerified: ['iOS/Android真实手机与系统键盘、安全区、读屏软件', '扬声器人工听音、静音模式、系统安装',
      'Slow 3G/LCP与5位陌生家长试用', '跨标签页同时提交、真实进程崩溃及所有存储容量组合', '外部托管平台现行发布能力'] };
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  for (const name of ['c-profiles-mobile.png', 'c-settings-mobile.png', 'a-stats-mobile.png']) await fs.copyFile(path.join(root, '.tmp', name), path.join(output, name));
  for (const width of [390, 1440]) for (const step of [1, 2, 3]) {
    const name = `wizard-local-step-${step}-${width}.png`;
    await fs.copyFile(path.join(root, '.tmp', name), path.join(output, name));
  }
  const artifacts = (await fs.readdir(output)).filter(name => name.endsWith('.png') || name.endsWith('.log') || name.endsWith('-results.json') || name === 'summary.json').sort();
  const checksums = await Promise.all(artifacts.map(async name => `${digest(await fs.readFile(path.join(output, name)))}  ${name}`));
  await fs.writeFile(path.join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  console.log(JSON.stringify({ status: summary.status, totals: summary.totals, staticSize: summary.staticSize, inputsUnchangedDuringRun: unchanged, output: relative(output) }, null, 2));
  if (summary.status !== 'passed') process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => server.close());
