# -*- coding: utf-8 -*-
"""通过 GitHub Contents API 同步当前 Git 提交（git 协议不通时的备用通道）。

只发布 HEAD 的已提交文件，不上传测试临时数据或未采用的本地素材。

用法：
  GH_TOKEN=... python docs/evidence/push_github.py --dry-run
  GH_TOKEN=... python docs/evidence/push_github.py
"""
import base64
import json
import os
import subprocess
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
    raw = subprocess.check_output(
        ['git', 'ls-tree', '--full-tree', '-r', '-z', '--name-only', 'HEAD'], cwd=ROOT)
    return sorted(path for path in raw.decode('utf-8').split('\0') if path)


def committed_content(path):
    # 读取提交中的字节，避免 Windows 工作区换行差异造成两边内容不同。
    return subprocess.check_output(['git', 'show', 'HEAD:' + path], cwd=ROOT)


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
    plan = [(rel, committed_content(rel), tree.get(rel)) for rel in files]
    new = [p for p in plan if p[2] is None]
    upd = [p for p in plan if p[2] is not None and p[2] != blob_sha(p[1])]
    same = [p for p in plan if p[2] is not None and p[2] == blob_sha(p[1])]
    deleted = sorted(set(tree) - set(files))

    print(f'远端 {len(tree)} 个文件，当前提交 {len(files)} 个文件')
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
