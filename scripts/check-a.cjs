/** A 修复 + A/B 集成验证；独立测试数据、本地随机端口，不执行发布。 */
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '');
const output = path.join(root, 'docs', '04-测试', 'evidence', 'A-integration-' + day);
const hash = data => createHash('sha256').update(data).digest('hex');
const unit = ['generator-options', 'paper-stats', 'paper-edit', 'quiz-session', 'history', 'mistakes-stats'].map(n => `tests/${n}.test.mjs`);
const browserTests = [['a-browser', 'tests/mistakes-browser.cjs', 'a-browser-results.json'],
  ['history-regression', 'tests/history-browser.cjs', 'history-checks.json']];
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    let data = await fs.readFile(file);
    if (path.extname(file) === '.html') data = Buffer.from(data.toString().replace('</head>', '<meta name="kidsmath-development" content="true"></head>'));
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
});
async function walk(folder) {
  const out = [];
  for (const entry of await fs.readdir(path.join(root, folder), { withFileTypes: true })) {
    const file = folder + '/' + entry.name;
    if (entry.isDirectory()) out.push(...await walk(file)); else out.push(file);
  }
  return out;
}
async function digest(files) {
  return Promise.all(files.map(async file => { const bytes = await fs.readFile(path.join(root, file));
    return { file, bytes: bytes.length, sha256: hash(bytes) }; }));
}
async function run(id, args, env = {}) {
  const startedAt = new Date().toISOString();
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, timeout: 180000 });
    let stdout = '', stderr = '', error = null;
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', e => { error = e.message; });
    child.on('close', async code => {
      const log = `command: node ${args.join(' ')}\nstartedAt: ${startedAt}\nexitCode: ${code}\nerror: ${error ?? ''}\n\nSTDOUT\n${stdout}\nSTDERR\n${stderr}`;
      await fs.writeFile(path.join(output, `${id}.log`), log);
      const result = { id, startedAt, exitCode: code, error, passed: code === 0 && !error,
        browserGroups: stdout.split(/\r?\n/).filter(s => s.startsWith('PASS')).length };
      if (id === 'unit') result.counts = Object.fromEntries(['tests', 'pass', 'fail'].map(k => [k, Number(stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1])]));
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${id}`); if (!result.passed) console.log(stderr.slice(-2000));
      resolve(result);
    });
  });
}
(async () => {
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(path.join(root, '.tmp'), { recursive: true });
  const runtime = ['index.html', 'manifest.webmanifest', 'sw.js', ...await walk('src'), ...(await walk('assets')).filter(f => /\.(css|png)$/.test(f))].sort();
  const inputs = await digest([...runtime, ...unit, ...browserTests.map(x => x[1]), 'scripts/check-a.cjs']);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const results = [await run('unit', ['--test', '--test-reporter=tap', ...unit])];
  for (const [id, script, artifact] of browserTests) {
    const result = await run(id, [script], { TEST_BASE_URL: `http://127.0.0.1:${server.address().port}/` });
    if (result.passed) {
      const bytes = await fs.readFile(path.join(root, '.tmp', artifact)), content = JSON.parse(bytes);
      if (Date.parse(content.executedAt) < Date.parse(result.startedAt) || content.checks.length !== result.browserGroups
          || !content.checks.every(s => s.startsWith('PASS'))) throw new Error('拒绝沿用过期或不一致的浏览器结果');
      await fs.writeFile(path.join(output, artifact), bytes);
    }
    results.push(result);
  }
  for (const name of ['a-stats-mobile.png']) await fs.copyFile(path.join(root, '.tmp', name), path.join(output, name));
  const after = await digest(inputs.map(x => x.file)), unchanged = inputs.every((x, i) => x.sha256 === after[i].sha256);
  const rawBytes = inputs.filter(x => runtime.includes(x.file) && !x.file.endsWith('.png')).reduce((n, x) => n + x.bytes, 0);
  const summary = { executedAt: new Date().toISOString(), scope: 'A修复及本地A+B集成；不代表C或真实手机验收',
    node: process.version, status: results.every(r => r.passed) && unchanged && rawBytes < 300000 ? 'passed' : 'failed',
    requirementBaseline: 'SRS V1.5', designBaseline: 'SDD V1.11', workerVersion: (await fs.readFile(path.join(root, 'sw.js'), 'utf8')).match(/const VERSION = '([^']+)'/)?.[1],
    totals: { unit: results[0].counts, browserGroups: results.slice(1).reduce((n, x) => n + x.browserGroups, 0) },
    staticSize: { rawBytes, limitBytes: 300000, includes: 'HTML,manifest,SW,CSS,all runtime JS; excludes PNG/tests/docs; not gzip' },
    inputsUnchangedDuringRun: unchanged, inputs, results };
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const files = (await fs.readdir(output)).filter(x => /\.(json|log|png)$/.test(x)).sort();
  const sums = await Promise.all(files.map(async name => `${hash(await fs.readFile(path.join(output, name)))}  ${name}`));
  await fs.writeFile(path.join(output, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
  console.log(JSON.stringify({ status: summary.status, totals: summary.totals, staticSize: summary.staticSize,
    inputsUnchangedDuringRun: unchanged, output: path.relative(root, output) }, null, 2));
  if (summary.status !== 'passed') process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
