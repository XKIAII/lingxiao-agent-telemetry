"""
Agent Telemetry Middleware — decorator & context manager.

Usage:
    from agent_telemetry import TelemetryMiddleware

    tm = TelemetryMiddleware(endpoint="http://localhost:3000", agent="my-agent")

    # Decorator
    @tm.trace(action="llm.call")
    def chat_with_llm(prompt):
        ...

    # Context manager
    with tm.span("web.search", params={"query": "news"}):
        results = do_search()
"""

import time
import functools
from contextlib import contextmanager
from typing import Optional, Dict, Any, Callable
from .client import TelemetryClient


class TelemetryMiddleware:
    """High-level middleware for Python Agent frameworks."""

    def __init__(
        self,
        endpoint: str = "http://localhost:3000",
        token: Optional[str] = None,
        agent: str = "python-sdk",
        timeout: float = 2.0,
    ):
        self.client = TelemetryClient(
            endpoint=endpoint, token=token, agent=agent, timeout=timeout
        )

    def trace(self, action: Optional[str] = None):
        """Decorator: auto-report pre/post for any function."""

        def decorator(func: Callable):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                action_name = action or f"{func.__module__}.{func.__name__}"
                start = time.perf_counter()
                self.client.report_pre(action_name, {"args": str(args)[:200], "kwargs": str(kwargs)[:200]})
                try:
                    result = func(*args, **kwargs)
                    duration = int((time.perf_counter() - start) * 1000)
                    self.client.report_post(action_name, {"success": True}, duration)
                    return result
                except Exception as e:
                    duration = int((time.perf_counter() - start) * 1000)
                    self.client.report_post(action_name, {"success": False, "error": str(e)}, duration)
                    raise

            return wrapper

        if callable(action):
            return decorator(action)
        return decorator

    @contextmanager
    def span(self, action: str, params: Optional[Dict[str, Any]] = None):
        """Context manager: wrap a block of code with pre/post reporting."""
        start = time.perf_counter()
        self.client.report_pre(action, params or {})
        result_data: Dict[str, Any] = {"success": True}
        try:
            yield
        except Exception as e:
            result_data = {"success": False, "error": str(e)}
            raise
        finally:
            duration = int((time.perf_counter() - start) * 1000)
            self.client.report_post(action, result_data, duration)
