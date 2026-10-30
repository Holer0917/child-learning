"""本地预览：禁用缓存，并为模块添加文件版本，避免新旧脚本混用。"""

import argparse
import io
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]


class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def send_head(self):
        # 首页始终生成 200 响应，避免旧的条件缓存保留旧模块依赖。
        if unquote(urlsplit(self.path).path) in ("/", "/index.html"):
            payload = self.preview_html().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            return io.BytesIO(payload)
        return super().send_head()

    def preview_html(self):
        root = Path(self.directory)
        imports = {}
        for source in sorted((root / "src").rglob("*.js")):
            url = "/" + quote(source.relative_to(root).as_posix())
            imports[url] = f"{url}?v={source.stat().st_mtime_ns}"
        mapping = json.dumps({"imports": imports}, ensure_ascii=False).replace("<", "\\u003c")
        html = (root / "index.html").read_text(encoding="utf-8")
        html = html.replace("</head>", '<meta name="kidsmath-development" content="true">\n</head>', 1)
        html = html.replace("</head>", f'<script type="importmap">{mapping}</script>\n</head>', 1)
        # script src / CSS 不经过 import map，入口也显式加版本。
        html = html.replace('src="./src/main.js"', f'src=".{imports["/src/main.js"]}"', 1)
        css_version = (root / "assets/css/base.css").stat().st_mtime_ns
        return html.replace('href="./assets/css/base.css"', f'href="./assets/css/base.css?v={css_version}"', 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--pwa", action="store_true", help="原始静态文件，用于离线/PWA 验证；建议单独使用 8766 端口")
    args = parser.parse_args()
    handler = partial(SimpleHTTPRequestHandler if args.pwa else PreviewHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Local: http://127.0.0.1:{args.port}/#/practice", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
