"""
Agent Telemetry — Python SDK for Agent Observability

Connect any Python Agent to your observability dashboard with one line of code.

Usage:
    from agent_telemetry import TelemetryClient, TelemetryMiddleware

    # Quick start
    tm = TelemetryMiddleware(endpoint="http://localhost:3000", agent="my-agent")

    with tm.span("agent.action"):
        do_work()
"""

from .client import TelemetryClient
from .middleware import TelemetryMiddleware

__version__ = "0.1.0"
__all__ = ["TelemetryClient", "TelemetryMiddleware"]
