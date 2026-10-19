# -*- coding: utf-8 -*-
"""通过 GitHub Contents API 同步变更文件（git 协议不通时的备用通道）。

用法：
  GH_TOKEN=... python docs/evidence/push_github.py --dry-run
  GH_TOKEN=... python docs/evidence/push_github.py
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
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
    import hashlib
    h = hashlib.sha1()
    h.update(b'blob %d\0' % len(data))
    h.update(data)
    return h.hexdigest()


def remote_tree():
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
            if fn.startswith('~$'):
                continue
            if fn.startswith('.') and fn != '.gitignore':
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

    tree = remote_tree()
    files = local_files()
    plan = [(rel, (ROOT / rel).read_bytes(), tree.get(rel)) for rel in files]
    new = [p for p in plan if p[2] is None]
    upd = [p for p in plan if p[2] is not None and p[2] != blob_sha(p[1])]
    same = [p for p in plan if p[2] is not None and p[2] == blob_sha(p[1])]
    deleted = sorted(set(tree) - set(files))

    print(f'远端 {len(tree)} 个文件，本地 {len(files)} 个文件')
    print(f'新增 {len(new)}，内容有变 {len(upd)}，未变跳过 {len(same)}')
    if deleted:
        print(f'远端独有（本脚本不删除）: {deleted}')
    todo = new + upd
    if dry:
        for rel, _, _ in todo:
            print(('  + ' if tree.get(rel) is None else '  ~ ') + rel)
        return
    for i, (rel, data, sha) in enumerate(todo, 1):
        put_file(rel, data, sha)
        print(f'[{i}/{len(todo)}] {rel}')
        time.sleep(0.4)


if __name__ == '__main__':
    main()
