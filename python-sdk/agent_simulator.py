"""
凌霄实时 Agent 模拟器

持续生成真实 Agent 操作数据流，让 Dashboard 活起来。
每 3-5 秒随机执行一种操作，上报到凌霄。

运行: python agent_simulator.py
停止: Ctrl+C
"""

import time
import random
import urllib.request
import json

API = "http://localhost:3000/api/telemetry/report"
AGENTS = ["langchain-bot", "workbuddy", "cursor-agent", "copilot"]

OPERATIONS = [
    {"action": "web.search", "tokens": 500, "cost": 0.002, "success_rate": 0.95},
    {"action": "llm.chat", "tokens": 1200, "cost": 0.006, "success_rate": 0.90},
    {"action": "file.read", "tokens": 50, "cost": 0.000, "success_rate": 0.98},
    {"action": "file.write", "tokens": 80, "cost": 0.000, "success_rate": 0.97},
    {"action": "code.analyze", "tokens": 800, "cost": 0.004, "success_rate": 0.93},
    {"action": "db.query", "tokens": 300, "cost": 0.001, "success_rate": 0.92},
    {"action": "shell.exec", "tokens": 100, "cost": 0.000, "success_rate": 0.96},
]

def send_telemetry(agent: str, action: str, tokens: int, cost: float, success: bool, error: str = None):
    data = json.dumps({
        "agent": agent,
        "phase": "post",
        "actionPath": action,
        "result": {"success": success, "error": error},
        "tokens": tokens,
        "cost": cost,
        "durationMs": random.randint(50, 500),
    }).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass

def simulate_attacks(agent: str):
    """随机注入一次攻击（小概率）"""
    attacks = [
        ("shell.exec", "越权命令"),
        ("file.delete", "删除受保护文件"),
        ("web.search", "SQL注入查询"),
    ]
    action, reason = random.choice(attacks)
    data = json.dumps({
        "agent": agent,
        "phase": "pre",
        "actionPath": action,
        "params": {"dangerous": True},
        "hookCheck": {"passed": False, "reason": f"检测到{reason}"},
    }).encode("utf-8")
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass

print("=" * 50)
print("  凌霄 Agent 模拟器 — 实时数据流")
print("  Dashboard: http://localhost:3000/dashboard.html")
print("  按 Ctrl+C 停止")
print("=" * 50)

iteration = 0
while True:
    agent = random.choice(AGENTS)
    op = random.choice(OPERATIONS)
    success = random.random() < op["success_rate"]
    
    send_telemetry(agent, op["action"], op["tokens"], op["cost"], success)
    
    # 10% 概率产生一次攻击拦截
    if random.random() < 0.10:
        simulate_attacks(agent)
    
    iteration += 1
    print(f"  [{iteration}] {agent} → {op['action']} {'OK' if success else 'XX'} ({op['tokens']}t / ${op['cost']:.4f})", end="\r")
    time.sleep(random.uniform(3, 6))
