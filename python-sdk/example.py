"""
Agent Telemetry SDK — 完整示例

演示三种接入方式：
  1. 装饰器 @tm.trace
  2. 上下文管理器 with tm.span
  3. 手动上报 report_pre / report_post

运行：
  先启动遥测服务：cd .. && npm start
  再运行示例：python example.py
  打开面板：http://localhost:3000/dashboard.html
"""

import time
import random
from agent_telemetry import TelemetryClient, TelemetryMiddleware

ENDPOINT = "http://localhost:3000"
AGENT = "python-sdk-demo"

# ========== 方式 1: 装饰器 ==========
tm = TelemetryMiddleware(endpoint=ENDPOINT, agent=AGENT)


@tm.trace(action="llm.chat")
def chat_with_llm(prompt: str) -> str:
    """模拟调用 LLM"""
    time.sleep(random.uniform(0.05, 0.2))
    return f"答复: {prompt[:20]}..."

@tm.trace(action="tool.search")
def search_web(query: str) -> dict:
    """模拟搜索工具"""
    time.sleep(random.uniform(0.05, 0.15))
    return {"results": random.randint(1, 10), "query": query}

# ========== 方式 2: 上下文管理器 ==========

def process_task(task: str):
    """模拟一个完整的任务流水线"""
    with tm.span("agent.plan", {"task": task}):
        time.sleep(0.1)  # planning

    with tm.span("agent.search", {"query": task}):
        results = search_web(task)

    with tm.span("agent.respond"):
        chat_with_llm(f"总结: {task}")

    return f"任务 '{task}' 完成，找到 {results.get('results', 0)} 条结果"

# ========== 方式 3: 直接上报 ==========
client = TelemetryClient(endpoint=ENDPOINT, agent=AGENT)

def simulate_risky_operation():
    """模拟带有安全检查的操作"""
    # Pre: 安全检查
    client.report_pre("shell.exec", {"cmd": "rm -rf /tmp/test"},
                      hook_check={"passed": False, "reason": "禁止操作系统临时目录"})

    # 这个操作实际上没执行，因为我们发现它被拦截了
    # Dashboard 会显示这条操作被 blocked

    # 另一个正常的操作
    client.report_pre("file.write", {"path": "/workspace/result.json"})
    time.sleep(0.2)
    client.report_post("file.write", {"success": True}, duration_ms=200)

# ========== 运行 ==========
if __name__ == "__main__":
    print(f"Agent Telemetry SDK Demo — {AGENT}")
    print(f"目标: {ENDPOINT}")
    print("-" * 40)

    # 1. 装饰器模式
    print("\n1. [装饰器] LLM 对话...")
    chat_with_llm("什么是 Agent 可观测性？")
    search_web("Agent observability tools 2026")

    # 2. 上下文管理器
    print("2. [上下文管理器] 任务流水线...")
    process_task("AI Agent 安全护栏")
    process_task("Agent 多模态能力")

    # 3. 直接上报
    print("3. [直接上报] 模拟风险操作...")
    simulate_risky_operation()

    # 4. 装饰器 + 异常处理
    print("4. [装饰器] 异常自动记录...")
    @tm.trace(action="tool.fail")
    def fail_operation():
        raise ValueError("模拟工具调用失败")
    try:
        fail_operation()
    except ValueError:
        pass

    print("\n" + "=" * 40)
    print("所有操作已上报到 Dashboard！")
    print("打开 http://localhost:3000/dashboard.html 查看")
