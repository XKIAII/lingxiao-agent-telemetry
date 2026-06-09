"""
LangChain Callback Handler for 凌霄

在任何 LangChain/LangGraph Agent 中，一行代码接入凌霄：

    from langchain_demo import LingXiaoCallback
    from langchain.agents import create_react_agent

    agent = create_react_agent(llm, tools, prompt,
        callbacks=[LingXiaoCallback(endpoint="http://localhost:3000", agent="my-agent")])

Handler 自动捕获:
  - on_llm_start/end → LLM 调用 (tokens, model, prompt)
  - on_tool_start/end → 工具调用 (action, params, result)
  - on_agent_action → Agent 决策
  - on_chain_start/end → 链式调用

用法:
  from lingxiao_callback import LingXiaoCallback
  handler = LingXiaoCallback(endpoint="http://localhost:3000", agent="langchain-agent")
"""

import time
import json
from typing import Any, Dict, Optional


class LingXiaoCallback:
    """
    LangChain Callback Handler。
    兼容 LangChain BaseCallbackHandler 接口，
    自动将所有 LLM 和 Tool 调用上报到凌霄平台。
    """

    def __init__(
        self,
        endpoint: str = "http://localhost:3000",
        token: Optional[str] = None,
        agent: str = "langchain-agent",
    ):
        self.endpoint = endpoint.rstrip("/")
        self.token = token
        self.agent = agent
        self._start_times: Dict[str, float] = {}

    def _post(self, path: str, data: Dict[str, Any]) -> None:
        """上报遥测数据"""
        import urllib.request
        url = f"{self.endpoint}/api{path}"
        if self.token:
            url += f"?token={self.token}"
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/json"}
        )
        try:
            urllib.request.urlopen(req, timeout=2)
        except Exception:
            pass

    def on_llm_start(self, serialized, prompts, **kwargs):
        run_id = kwargs.get("run_id", str(time.time()))
        self._start_times[run_id] = time.time()
        self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "pre",
            "actionPath": "llm.call",
            "params": {"model": serialized.get("name", "unknown"), "prompts": len(prompts)},
        })

    def on_llm_end(self, response, **kwargs):
        run_id = kwargs.get("run_id", "")
        start = self._start_times.pop(run_id, time.time())
        duration = int((time.time() - start) * 1000)

        usage = getattr(response, "llm_output", {}) or {}
        token_usage = usage.get("token_usage", {})
        tokens = token_usage.get("total_tokens", 0)
        model = usage.get("model_name", "")

        self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "post",
            "actionPath": "llm.call",
            "result": {"success": True},
            "durationMs": duration,
            "tokens": tokens,
            "model": model,
        })

    def on_tool_start(self, serialized, input_str, **kwargs):
        run_id = kwargs.get("run_id", str(time.time()))
        self._start_times[run_id] = time.time()
        tool_name = serialized.get("name", "unknown")
        self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "pre",
            "actionPath": f"tool.{tool_name}",
            "params": {"input": str(input_str)[:200]},
        })

    def on_tool_end(self, output, **kwargs):
        run_id = kwargs.get("run_id", "")
        start = self._start_times.pop(run_id, time.time())
        duration = int((time.time() - start) * 1000)
        self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "post",
            "actionPath": "tool.call",
            "result": {"success": True, "output": str(output)[:200]},
            "durationMs": duration,
        })

    def on_agent_action(self, action, **kwargs):
        self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "post",
            "actionPath": "agent.decide",
            "params": {"tool": action.tool, "input": str(action.tool_input)[:200]},
            "result": {"success": True},
        })

    def on_llm_error(self, error, **kwargs):
        run_id = kwargs.get("run_id", "")
        self._start_times.pop(run_id, None)
        self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "post",
            "actionPath": "llm.call",
            "result": {"success": False, "error": str(error)[:200]},
        })

    def on_tool_error(self, error, **kwargs):
        run_id = kwargs.get("run_id", "")
        self._start_times.pop(run_id, None)
        self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "post",
            "actionPath": "tool.call",
            "result": {"success": False, "error": str(error)[:200]},
        })
