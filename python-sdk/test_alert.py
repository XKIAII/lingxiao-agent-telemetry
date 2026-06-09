"""
告警触发测试 — 发送大量被拦截操作，触发告警引擎推送 Webhook

用法:
  1. 先启动 webhook 接收端: python webhook_receiver.py
  2. 确保遥测服务带 webhook URL 启动:
     export ALERT_WEBHOOK_URL="http://localhost:9001/webhook"
     npm start
  3. 运行此脚本: python test_alert.py
"""

import urllib.request
import json
import time

API = "http://localhost:3000/api/telemetry/report"

def send_blocked(action: str, reason: str):
    data = json.dumps({
        "agent": "alert-test",
        "phase": "pre",
        "actionPath": action,
        "params": {"test": True},
        "hookCheck": {"passed": False, "reason": reason},
    }).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=3)

print("发送 10 个被拦截操作(触发告警)...")
for i in range(10):
    send_blocked(f"test.block-{i+1}", f"模拟拦截 #{i+1}")
    time.sleep(0.05)

print("已发送。检查 webhook 接收端是否收到 ALERT 推送。")
print(f"Dashboard: http://localhost:3000/dashboard.html?agent=alert-test")
