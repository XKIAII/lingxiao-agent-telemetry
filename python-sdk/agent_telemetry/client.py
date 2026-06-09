"""
Agent Telemetry SDK — Python Client

pip install agent-telemetry

Usage:
    from agent_telemetry import TelemetryClient

    client = TelemetryClient(endpoint="http://localhost:3000")
    client.report_pre("llm.call", {"model": "gpt4"})
    # ... do work ...
    client.report_post("llm.call", {"success": True})
"""

import json
import urllib.request
import urllib.error
import time
from typing import Optional, Dict, Any


class TelemetryClient:
    """Low-level HTTP client for the Agent Telemetry API."""

    def __init__(
        self,
        endpoint: str = "http://localhost:3000",
        token: Optional[str] = None,
        agent: str = "python-sdk",
        timeout: float = 2.0,
    ):
        self.endpoint = endpoint.rstrip("/")
        self.token = token
        self.agent = agent
        self.timeout = timeout

    def _post(self, path: str, data: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.endpoint}/api{path}"
        if self.token:
            url += f"?token={self.token}"
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.token}" if self.token else "",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read())
        except urllib.error.URLError:
            return {"recorded": False, "error": "endpoint unreachable"}
        except Exception as e:
            return {"recorded": False, "error": str(e)}

    def report_pre(
        self,
        action: str,
        params: Optional[Dict[str, Any]] = None,
        hook_check: Optional[Dict[str, Any]] = None,
        user: Optional[str] = None,
        tokens: int = 0,
        cost: float = 0.0,
        model: str = "",
    ) -> Dict[str, Any]:
        """Report a pre-operation checkpoint (before tool execution)."""
        return self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "pre",
            "actionPath": action,
            "params": params or {},
            "hookCheck": hook_check or {"passed": True},
            "user": user,
            "tokens": tokens,
            "cost": cost,
            "model": model,
        })

    def report_post(
        self,
        action: str,
        result: Optional[Dict[str, Any]] = None,
        duration_ms: int = 0,
        user: Optional[str] = None,
        tokens: int = 0,
        cost: float = 0.0,
        model: str = "",
    ) -> Dict[str, Any]:
        """Report a post-operation result (after tool execution)."""
        return self._post("/telemetry/report", {
            "agent": self.agent,
            "phase": "post",
            "actionPath": action,
            "result": result or {"success": True},
            "durationMs": duration_ms,
            "user": user,
            "tokens": tokens,
            "cost": cost,
            "model": model,
        })

    def report_span(
        self,
        action: str,
        params: Optional[Dict[str, Any]] = None,
        result: Optional[Dict[str, Any]] = None,
        duration_ms: int = 0,
    ) -> Dict[str, Any]:
        """Report both pre and post in one call."""
        pre = self.report_pre(action, params)
        post = self.report_post(action, result, duration_ms)
        return {"pre": pre, "post": post}
