# -*- coding: utf-8 -*-
"""通过 GitHub Contents API 把本地仓库同步到 Holer0917/child-learning。

用法：python docs/evidence/push_github.py --dry-run
      python docs/evidence/push_github.py
令牌从环境变量 GH_TOKEN 读取，不写入文件。
"""
import base64
import json
import os
import sys
import time
import urllib.request

ROOT = __import__('pathlib').Path(__file__).resolve().parents[2]
TOKEN = os.environ.get('GH_TOKEN', '')
REPO = 'Holer0917/child-learning'
BRANCH = 'main'
SKIP_DIRS = {'.git', '.tmp', 'node_modules'}
SKIP_SUFFIX = {'.zip'}


def api(path, method='GET', body=None):
    req = urllib.request.Request(
        'https://api.github.com' + path,
        method=method,
        headers={
            'Authorization': 'token ' + TOKEN,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'kidsmath-sync',
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def blob_sha(data):
    """计算 git blob 的 SHA-1，用于判断远端内容是否已相同。"""
    import hashlib
    h = hashlib.sha1()
    h.update(b'blob %d\0' % len(data))
    h.update(data)
    return h.hexdigest()


def remote_tree():
    """返回 {path: sha}（仅文件）。空仓库返回 {}。"""
    try:
        info = api(f'/repos/{REPO}/git/trees/{BRANCH}?recursive=1')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        raise
    return {n['path']: n['sha'] for n in info.get('tree', []) if n['type'] == 'blob'}


def local_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel_dir = os.path.relpath(dirpath, ROOT).replace('\\', '/')
        if rel_dir == '.':
            rel_dir = ''
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in SKIP_SUFFIX:
                continue
            if fn.startswith('~$') or fn.startswith('.'):
                continue
            rel = f'{rel_dir}/{fn}' if rel_dir else fn
            out.append(rel)
    return sorted(out)


def put_file(path, content, sha=None):
    body = {
        'message': f'sync: {path}',
        'content': base64.b64encode(content).decode(),
        'branch': BRANCH,
    }
    if sha:
        body['sha'] = sha
    return api(f'/repos/{REPO}/contents/{urllib.parse.quote(path)}', 'PUT', body)


def main():
    dry = '--dry-run' in sys.argv
    if not TOKEN:
        sys.exit('GH_TOKEN 未设置')
    import urllib.parse  # noqa: F811  供 put_file 使用

    tree = remote_tree()
    files = local_files()
    print(f'远端文件 {len(tree)} 个，本地文件 {len(files)} 个')
    plan = []
    for rel in files:
        data = (ROOT / rel).read_bytes()
        plan.append((rel, data, tree.get(rel)))
    new = [p for p in plan if p[2] is None]
    upd = [p for p in plan if p[2] is not None and p[2] != blob_sha(p[1])]
    same = [p for p in plan if p[2] is not None and p[2] == blob_sha(p[1])]
    deleted = sorted(set(tree) - set(files))
    print(f'新增 {len(new)}，内容有变 {len(upd)}，内容相同跳过 {len(same)}，远端独有（不删除）{len(deleted)}')
    for p in same:
        print('  = 未变化:', p[0])
    for d in deleted:
        print('  远端独有:', d)
    if dry:
        for p in new:
            print('  +', p[0])
        for p in upd:
            print('  ~', p[0])
        return
    for i, (rel, data, sha) in enumerate(plan, 1):
        put_file(rel, data, sha)
        print(f'[{i}/{len(plan)}] {rel}')
        time.sleep(0.4)


if __name__ == '__main__':
    main()
