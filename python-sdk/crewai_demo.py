"""
CrewAI + 凌霄 集成演示

演示多 Agent 协作工作流如何通过凌霄 Python SDK 实现全链路可观测。
不需要 OpenAI Key — 使用 mock LLM，但展示了真实的集成模式。

集成要点:
  - 每个 Agent 的 step_callback 中上报遥测
  - 每个 Tool 的执行前后记录
  - 最终任务结果和 cost 汇总

运行: python crewai_demo.py
"""

import time
import random
from agent_telemetry import TelemetryMiddleware

ENDPOINT = "http://localhost:3000"
TEAM = "security-review-crew"

tm = TelemetryMiddleware(endpoint=ENDPOINT, agent=TEAM)


# ========== 模拟 Agent ==========

class Agent:
    """模拟 CrewAI Agent"""
    def __init__(self, name: str, role: str, goal: str):
        self.name = name
        self.role = role
        self.goal = goal

    def execute(self, task: str) -> str:
        with tm.span(f"agent.{self.name}.execute", {"task": task[:80]}):
            time.sleep(random.uniform(0.05, 0.15))
            tm.client.report_post(
                f"agent.{self.name}.execute",
                {"success": True, "output": f"[{self.name}] 完成: {task[:30]}..."},
                tokens=random.randint(200, 600),
                cost=round(random.uniform(0.001, 0.008), 6),
                duration_ms=int(random.uniform(50, 150)),
            )
            return f"[{self.name}] 分析完成"


def run_crew_demo():
    print("=" * 60)
    print("  CrewAI 多 Agent 协作 — 凌霄全链路监控")
    print("=" * 60)

    # 创建 Team
    analyzer = Agent("SecurityAnalyzer", "安全分析师", "检测代码中的安全漏洞")
    reviewer = Agent("CodeReviewer", "代码审查员", "审查代码质量和安全实践")
    reporter = Agent("ReportWriter", "报告生成器", "生成安全评审报告")

    crew_name = "安全评审团队"

    # Task 1: 分析
    with tm.span(f"crew.{crew_name}.task", {"task": "安全漏洞扫描"}):
        print(f"\n▶ Task 1: {analyzer.name} 扫描安全漏洞")
        result1 = analyzer.execute("扫描代码库中的 SQL 注入和 XSS 漏洞")

    # Task 2: 审查
    with tm.span(f"crew.{crew_name}.task", {"task": "代码审查"}):
        print(f"▶ Task 2: {reviewer.name} 审查代码质量")
        result2 = reviewer.execute("审查 API 端点的安全实践")

    # Task 3: 报告
    with tm.span(f"crew.{crew_name}.task", {"task": "生成报告"}):
        print(f"▶ Task 3: {reporter.name} 生成安全报告")
        result3 = reporter.execute("整合分析结果生成最终报告")

    # 汇总
    with tm.span(f"crew.{crew_name}.summary", {}):
        tm.client.report_post(
            f"crew.{crew_name}.summary",
            {"success": True, "tasks": 3, "agents": 3},
            tokens=1200,
            cost=0.015,
            duration_ms=500,
        )

    print(f"\n  Crew 完成: {crew_name}")
    print(f"  Dashboard: {ENDPOINT}/dashboard.html?agent={TEAM}")
    print("=" * 60)


if __name__ == "__main__":
    run_crew_demo()
