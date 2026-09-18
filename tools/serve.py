#!/usr/bin/env python3
"""내보낸 웹 빌드를 로컬에서 띄운다. docs/PLAN.md §15.1 (개발 중 확인용)

같은 Wi-Fi 의 폰에서 표시된 주소로 접속하면 된다.
COOP/COEP 헤더를 함께 보낸다 — thread_support 를 켠 빌드도 돌아가게 하려는 것이고,
꺼진 빌드에는 영향이 없다.
"""
import http.server
import socket
import socketserver
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("build/web")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass          # 요청마다 한 줄씩 찍으면 시끄럽다


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))       # 실제로 보내지 않는다. 경로만 물어본다.
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main() -> int:
    if not (ROOT / "index.html").exists():
        print(f"내보낸 빌드가 없습니다: {ROOT}/index.html", file=sys.stderr)
        print("먼저 ./run.sh web 을 실행하세요.", file=sys.stderr)
        return 1
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"  이 컴퓨터:  http://localhost:{PORT}")
        print(f"  폰에서:     http://{lan_ip()}:{PORT}   (같은 Wi-Fi)")
        print("  멈추려면 Ctrl+C")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
