"""
Webhook 接收端 — 验证告警推送链路

用法:
  终端A: python webhook_receiver.py     (启动接收端)
  终端B: 设置 ALERT_WEBHOOK_URL 并运行 server
          export ALERT_WEBHOOK_URL="http://localhost:9001/webhook"
          npm start
  终端C: 发送大量被拦截操作触发告警
          curl -X POST http://localhost:3000/api/telemetry/report -H 'Content-Type: application/json' \
            -d '{"agent":"test","phase":"pre","actionPath":"test.block","params":{},"hookCheck":{"passed":false,"reason":"模拟拦截"}}'
"""

import json
import http.server
import sys
from datetime import datetime

class WebhookHandler(http.server.BaseHTTPRequestHandler):
    """接收并展示 webhook 推送"""

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            data = {"raw": body}

        now = datetime.now().strftime("%H:%M:%S")

        print(f"\n{'='*50}")
        print(f"  Webhook 收到 [{now}]")
        print(f"{'='*50}")
        print(f"  类型:   {data.get('type', '?')}")
        print(f"  消息:   {data.get('message', '?')}")
        print(f"  时间:   {data.get('timestamp', '?')}")
        if data.get("blocks"):
            print(f"  拦截操作:")
            for b in data["blocks"]:
                print(f"    • {b.get('hook','?')} → {b.get('action','?')}: {b.get('reason','?')}")
        print(f"{'='*50}\n")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"received": True}).encode())

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Webhook Receiver Running\\n")

    def log_message(self, format, *args):
        pass  # 安静模式


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9001
    server = http.server.HTTPServer(("0.0.0.0", port), WebhookHandler)
    print(f"Webhook 接收端 → http://localhost:{port}/webhook")
    print(f"等待告警推送...\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
