import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const data = new Map(), checks = [];
let rejectWrites = false, failNth = 0, writes = 0, failRemove = '';
globalThis.localStorage = {
  get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
  getItem: key => data.get(key) ?? null,
  setItem(key, value) {
    if (rejectWrites || (++writes === failNth)) throw new DOMException('simulated storage full', 'QuotaExceededError');
    data.set(key, String(value));
  },
  removeItem(key) { if (key === failRemove) throw new Error('simulated remove denied'); data.delete(key); }
};
const storage = await import('./sandbox/src/core/storage.js');
const profiles = await import('./sandbox/src/domain/profile.js');
const backup = await import('./sandbox/src/domain/backup.js');
const schema = await import('./sandbox/src/core/schema.js');
const syllabus = await import('./sandbox/src/domain/syllabus.js');
const generator = await import('./sandbox/src/domain/generator.js');
const grader = await import('./sandbox/src/domain/grader.js');
const history = await import('./sandbox/src/domain/history.js');
const mistakes = await import('./sandbox/src/domain/mistakes.js');
const quiz = await import('./sandbox/src/app/quizSession.js');
const clone = value => structuredClone(value);
const snapshot = () => [...data].sort(([a], [b]) => a.localeCompare(b));
function reset() { rejectWrites = false; failNth = 0; writes = 0; failRemove = ''; data.clear(); storage.__resetForTest(); }
const paper = seed => generator.generatePaper({ kpIds: ['G2-01'], count: 5, types: ['horizontal'], seed });
const known = id => !!syllabus.getKnowledgePoint(id);
function seed() { reset(); return profiles.createProfile({ name: '审查样例', grade: 2 }); }
function result(pid, seedValue = 1) {
  const p = paper(seedValue);
  const attempts = Object.fromEntries(p.questions.map((q, i) => [q.id, { userAnswer: i ? q.answer : '-999', skipped: false }]));
  return { ...grader.settleSession(p, attempts, 5000), id: 'review-record', profileId: pid };
}
async function check(id, kind, name, fn) {
  try { const observed = await fn(); checks.push({ id, kind, name, reproduced: true, observed }); }
  catch (error) { checks.push({ id, kind, name, reproduced: false, error: error.stack }); }
  console.log(JSON.stringify({ id, kind, reproduced: checks.at(-1).reproduced, name }));
}

await check('C-P01', 'positive', '三档案上限、编辑、切换与数据隔离', () => {
  const p = seed(), p2 = profiles.createProfile({ name: '样例二', grade: 1 }), p3 = profiles.createProfile({ name: '样例三', grade: 3 });
  assert.throws(() => profiles.createProfile({ name: '第四个', grade: 1 }));
  storage.write('sessions:' + p.id, [result(p.id)]);
  profiles.updateProfile(p2.id, { name: '修改后的昵称', grade: 2, avatar: profiles.AVATARS[2] });
  profiles.switchProfile(p2.id); assert.equal(history.listHistory().length, 0);
  profiles.switchProfile(p.id); assert.equal(history.listHistory().length, 1);
  return { profiles: profiles.listProfiles().length, fourthRejected: true, profileIsolation: true, updatedName: profiles.getProfile(p2.id).name };
});
await check('C-P02', 'positive', '正常级联删除登记键，保留其他档案和同源其他数据', () => {
  const p = seed(), p2 = profiles.createProfile({ name: '保留档案', grade: 1 });
  for (const fn of profiles.PARTITION_KEY_TEMPLATES) { storage.write(fn(p.id), { marker: 'delete' }); storage.write(fn(p2.id), { marker: 'keep' }); }
  data.set('other-app:key', 'keep');
  const response = profiles.removeProfile(p.id);
  assert.equal(response.removed, true);
  assert.ok(profiles.PARTITION_KEY_TEMPLATES.every(fn => !data.has('km:' + fn(p.id))));
  assert.ok(profiles.PARTITION_KEY_TEMPLATES.every(fn => data.has('km:' + fn(p2.id))));
  assert.equal(data.get('other-app:key'), 'keep');
  return { registeredPartitions: profiles.PARTITION_KEY_TEMPLATES.length, remainingProfiles: profiles.listProfiles().length, otherDataPreserved: true };
});
await check('C-P03', 'positive', '日期/知识点筛选与历史单删不反向删除错题', () => {
  const p = seed(), r = result(p.id);
  r.finishedAt = new Date(2026, 9, 28, 12).getTime(); r.kpCount = { 'G2-01': 5 };
  storage.write('sessions:' + p.id, [r]); assert.equal(mistakes.archiveSession(r).ok, true);
  const wrongBefore = data.get('km:mistakes:' + p.id);
  assert.equal(history.filterHistory(history.listHistory(), { from: '2026-10-28', to: '2026-10-28', kpId: 'G2-01' }).length, 1);
  assert.equal(history.filterHistory(history.listHistory(), { from: '2026-10-29' }).length, 0);
  assert.equal(history.deleteHistoryRecord(r.id), true); assert.equal(history.listHistory().length, 0);
  assert.equal(data.get('km:mistakes:' + p.id), wrongBefore);
  return { dateInclusive: true, kpFilter: true, historyDeleted: true, mistakesUnchanged: true };
});
await check('C-P04', 'positive', '无A错题容器的C备份正常回导', () => {
  const p = seed(); storage.write('sessions:' + p.id, [result(p.id)]);
  const payload = backup.buildBackup(); assert.deepEqual(schema.validateBackupPayload(payload, known), []);
  const response = backup.applyBackup(payload); assert.equal(response.ok, true);
  return { response, restoredHistory: history.listHistory().length };
});
await check('C-D01', 'defect', '现有A错题V2容器导出后无法回导，预览错题数误报0', () => {
  const p = seed(), r = result(p.id); storage.write('sessions:' + p.id, [r]);
  assert.equal(mistakes.archiveSession(r).ok, true);
  const payload = backup.buildBackup(), errors = schema.validateBackupPayload(payload, known), preview = backup.previewBackup(payload);
  assert.equal(payload.data[p.id].mistakes.version, 2);
  assert.equal(payload.data[p.id].mistakes.items.length, 1);
  assert.ok(errors.some(e => e.path.endsWith('.mistakes'))); assert.equal(preview.perProfile[0].mistakeCount, 0);
  assert.equal(backup.applyBackup(payload).ok, false);
  return { actualMistakes: 1, previewMistakes: 0, errors, importRejected: true };
});
await check('C-D02', 'defect', '重练和变式会话被旧schema判无效并删除', () => {
  const observations = [];
  for (const mode of ['practice', 'retry', 'variant']) {
    const p = seed(), generated = paper(3);
    if (mode !== 'practice') { generated[mode] = true; generated.sourceMistakeIds = ['review-mistake']; }
    const session = quiz.createSession(generated), before = storage.read('quiz:active:' + p.id);
    const resumed = quiz.resumeSession();
    assert.equal(!!resumed, mode === 'practice');
    observations.push({ mode: session.mode, storedBeforeResume: !!before, resumed: !!resumed, diskAfterResume: !!storage.read('quiz:active:' + p.id) });
  }
  return observations;
});
await check('C-D03', 'defect', '持续写入失败时回滚丢数据但仍提示已恢复', () => {
  const p = seed(); storage.write('sessions:' + p.id, [result(p.id)]); storage.write('settings', { sound: true });
  const payload = backup.buildBackup(), before = snapshot(); rejectWrites = true;
  const response = backup.applyBackup(payload); rejectWrites = false;
  const after = snapshot();
  assert.equal(response.ok, false); assert.ok(response.errors[0].message.includes('已恢复原有数据'));
  assert.notDeepEqual(after, before); assert.equal(storage.read('profiles', null), null); assert.equal(storage.read('sessions:' + p.id, null), null);
  return { originalKeys: before.map(([key]) => key), remainingKeys: after.map(([key]) => key), response };
});
await check('C-P05', 'positive', '单次写入失败且后续存储恢复时可以回滚', () => {
  const p = seed(); storage.write('sessions:' + p.id, [result(p.id)]);
  const payload = backup.buildBackup(), before = snapshot(); writes = 0; failNth = 3;
  const response = backup.applyBackup(payload); failNth = 0;
  assert.equal(response.ok, false); assert.deepEqual(snapshot(), before);
  return { failedWrite: 3, originalDataRestored: true, response };
});
await check('C-D04', 'defect', '备份未包含音效设置，恢复成功后旧设置被删除', () => {
  const p = seed(); storage.write('settings', { sound: true, theme: 'auto' });
  const payload = backup.buildBackup(); assert.equal('settings' in payload, false);
  assert.equal(backup.applyBackup(payload).ok, true); assert.equal(storage.read('settings', null), null);
  return { exportedSettings: false, restoredSettings: storage.read('settings', null) };
});
await check('C-D05', 'defect', '导入未清理quizSession内存，继续作答覆盖恢复的会话', () => {
  const p = seed(), original = quiz.createSession(paper(12)), payload = backup.buildBackup();
  payload.data[p.id].quizActive.id = 'restored-active'; payload.data[p.id].quizActive.paper = paper(13);
  assert.equal(backup.applyBackup(payload).ok, true);
  const importedOnDisk = storage.read('quiz:active:' + p.id).id, resumed = quiz.resumeSession();
  assert.equal(importedOnDisk, 'restored-active'); assert.equal(resumed.id, original.id);
  quiz.saveDraft('42'); assert.equal(storage.read('quiz:active:' + p.id).id, original.id);
  return { diskAfterImport: importedOnDisk, memoryResume: resumed.id, diskAfterNextSave: storage.read('quiz:active:' + p.id).id, recoveredSessionOverwritten: true };
});
await check('C-D06', 'defect', '备份校验放过档案上限、非法版本及坏题目/会话', () => {
  const p = seed(), base = backup.buildBackup(), accepted = [];
  const mutations = [
    ['version=-1', b => b.version = -1],
    ['version=0', b => b.version = 0],
    ['exportedAt=invalid', b => b.exportedAt = 'invalid'],
    ['profiles=4', b => { for (let i = 2; i <= 4; i++) { const id = 'extra-' + i; b.profiles.push({ ...b.profiles[0], id }); b.data[id] = { sessions: [], mistakes: [] }; } }],
    ['missing profile data', b => b.data = {}],
    ['whitespace nickname', b => b.profiles[0].name = '   '],
    ['grade is string', b => b.profiles[0].grade = '2'],
    ['session total=999', b => b.data[p.id].sessions = [{ id: 'oversize', profileId: p.id, finishedAt: Date.now(), total: 999, correct: 999, wrong: 0, skipped: 0, compressed: true }]],
    ['question ids duplicated', b => { const r = result(p.id); r.paper.questions[1].id = r.paper.questions[0].id; b.data[p.id].sessions = [r]; }],
    ['fraction denominator zero', b => { const r = result(p.id); Object.assign(r.paper.questions[0], { kind: 'fraction', answer: '1/0', params: { a: 1, b: 1, d: 0 } }); b.data[p.id].sessions = [r]; }],
    ['empty paper questions', b => { const r = result(p.id); r.paper.questions = []; b.data[p.id].sessions = [r]; }],
    ['invalid active session', b => b.data[p.id].quizActive = { schemaVersion: 1, id: 'bad-active', profileId: p.id, paper: { questions: [] }, attempts: {}, retries: {}, mode: 'unknown', cursor: -1, startAt: -1 }],
    ['arbitrary mistake item', b => b.data[p.id].mistakes = [{ unexpected: 'not a mistake' }]],
    ['unknown badges version', b => b.data[p.id].badges = { version: 999, items: 'invalid' }]
  ];
  for (const [name, mutate] of mutations) { const b = clone(base); mutate(b); const errors = schema.validateBackupPayload(b, known); assert.equal(errors.length, 0, name); accepted.push(name); }
  return { incorrectlyAcceptedCases: accepted.length, accepted };
});
await check('C-D07', 'defect', '删除分区失败被吞掉，仍返回档案已删除', () => {
  const p = seed(); storage.write('sessions:' + p.id, [result(p.id)]); profiles.createProfile({ name: '另一个档案', grade: 1 });
  failRemove = 'km:sessions:' + p.id; const response = profiles.removeProfile(p.id); failRemove = '';
  assert.equal(response.removed, true); assert.ok(data.has('km:sessions:' + p.id)); assert.equal(profiles.getProfile(p.id), null);
  return { reportedRemoved: true, childDataRemains: true, deletedProfilePresent: false };
});
await check('C-D08', 'defect', '昵称实现与1至12字符及空值默认需求不一致', () => {
  seed(); const long = profiles.createProfile({ name: 'abcdefghijklm', grade: 1 });
  assert.equal(long.name.length, 13); assert.throws(() => profiles.createProfile({ name: '', grade: 1 }));
  return { thirteenCharacterNameAccepted: true, emptyNameDefaultRejected: true };
});
await check('C-D09', 'defect', '需求定义的备份格式被拒绝，未记录格式变更', async () => {
  const text = await fs.readFile(new URL('../../docs/02-需求分析/03-需求规格说明书.md', import.meta.url), 'utf8');
  const section = text.split('### 4.4 数据交换格式')[1];
  const payload = JSON.parse(section.match(/```json\s*([\s\S]*?)```/)[1]);
  const errors = schema.validateBackupPayload(payload, known);
  assert.ok(errors.some(e => e.path === '$.app')); assert.ok(errors.some(e => e.path === '$.version'));
  return { formatInRequirements: payload.format, requirementsVersion: payload.version, rejection: errors };
});
await check('C-D10', 'defect', '导出文件名带连字符且显示字节数与UTF8实际不一致', () => {
  seed();
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) };
  const response = backup.downloadBackup(), actualBytes = new Blob([JSON.stringify(backup.buildBackup(), null, 2)]).size;
  assert.match(response.filename, /kidsmath-backup-\d{4}-\d{2}-\d{2}\.json/); assert.notEqual(response.bytes, actualBytes);
  return { filename: response.filename, reportedBytes: response.bytes, actualUtf8Bytes: actualBytes };
});
await check('C-P06', 'positive', '超大文件与未来版本在写入前拒绝', async () => {
  seed(); const before = snapshot();
  assert.equal((await backup.parseBackupFile({ size: backup.MAX_BACKUP_BYTES + 1 })).ok, false);
  const b = backup.buildBackup(); b.version = 99;
  assert.equal(backup.applyBackup(b).ok, false); assert.deepEqual(snapshot(), before);
  return { oversizeFileRejected: true, futureVersionRejected: true, diskUnchanged: true };
});

const resultFile = new URL('./probe-results.json', import.meta.url);
const output = { executedAt: new Date().toISOString(), basis: 'C ZIP overlay on current local A+B in isolated sandbox; not Gitee HEAD',
  checks, totals: { probes: checks.length, reproduced: checks.filter(x => x.reproduced).length,
    positive: checks.filter(x => x.kind === 'positive' && x.reproduced).length,
    defectGroups: checks.filter(x => x.kind === 'defect' && x.reproduced).length } };
await fs.writeFile(resultFile, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output.totals));
if (checks.some(x => !x.reproduced)) process.exitCode = 1;
