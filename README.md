# 凌霄 (LingXiao) — Agent 可观测平台

[![Test](https://img.shields.io/badge/test-23/23_passing-brightgreen)](https://github.com/XKIAII/lingxiao-agent-telemetry)
[![Hooks](https://img.shields.io/badge/hooks-10_online-blue)](https://github.com/XKIAII/lingxiao-agent-telemetry)
[![License](https://img.shields.io/badge/license-Proprietary-red)](https://github.com/XKIAII/lingxiao-agent-telemetry)

> Agent 安全护栏 + 可观测性中间件。10 个安全 Hook，15 条攻击向量，四象限产品矩阵。

## 为什么

Agent 生态正在从"能跑就行"过渡到"安全可靠"。但现有的 APM 工具不懂 Agent 语义，LangSmith 只管 LLM 调用链——**Agent 的每一步操作，谁来监控？谁来拦截？**

凌霄正好卡在这个转折点上——在 Agent 的每个操作前后插入 Hook，实时检查、实时拦截、实时审计。

## 架构

```
┌────────────────────────────────────────┐
│  记忆层    ConfigRegistry + RuleEngine │
│  知识层    SkillRegistry (可复用能力)  │
│  护栏层    HookManager (10 个Hook)     │ ← 安全交汇点
│  委派层    SubAgentManager (并行分发)  │
│  分发层    PluginManager (MCP/插件)    │
└────────────────────────────────────────┘
```

## 快速开始

```bash
git clone https://github.com/XKIAII/lingxiao-agent-telemetry.git
cd agent-core-demo
npm install && npm start
```

打开 http://localhost:3000/dashboard.html

```bash
# 生成演示数据
cd python-sdk && python red_team.py

# LangChain Agent 模拟
python langchain_demo.py
```

## 四象限

| 工具 | 谁用 | 做什么 |
|------|------|--------|
| 📊 **监控台** | 运维 | 实时面板 · KPI 卡片 · 告警推送 · 成本追踪 |
| 🛡 **安全中心** | IT 安全 | 10 个 Hook 护栏 · 红队引擎 · 合规报告 |
| 🔧 **调试器** | 开发者 | 单步回放 · 操作对比 · Diff 差异视图 |
| 📈 **评测基准** | 产品经理 | Agent A/B 对比 · 安全评分 |

## 安全护栏 (10 Hooks)

```
P0  FileDeleteGuard      文件删除防护
P1  SQLInjectionDetector SQL 注入检测
P1  XSSDetector          XSS 跨站脚本防护
P1  PathTraversalDetector 路径遍历防护
P1  SecretDetector       敏感信息检测 (API Key / 密码)
P1  GlobalAuthGuard      全局用户鉴权
P1  FileNameValidator    文件名校验
P2  AuditTrail           全量操作审计追踪
P2  NotificationHook     文件删除通知
P2  PluginCounterAudit   插件审计
```

## Python SDK

```python
from agent_telemetry import TelemetryMiddleware

tm = TelemetryMiddleware(endpoint="http://localhost:3000", agent="my-agent")

# 装饰器
@tm.trace(action="llm.chat")
def chat(prompt): ...

# 上下文管理器 (自动上报 pre/post + tokens/cost)
with tm.span("agent.search", params={"query": "..."}):
    results = do_search()
```

## API

| 方法 | 端点 | 用途 |
|------|------|------|
| GET | `/api/stats` | 统计摘要 |
| GET | `/api/audit` | 审计日志 (分页/筛选) |
| GET | `/api/timeline` | 操作时序 |
| GET | `/api/hooks` | Hook 清单 |
| GET | `/api/cost` | 成本摘要 |
| GET | `/api/compliance/report` | 合规报告 |
| GET | `/api/agents` | Agent 列表 |
| GET | `/api/alerts` | 告警状态 |
| POST | `/api/telemetry/report` | 遥测上报 |
| POST | `/api/hooks-config` | 规则热修改 |

**完整文档**: 见 README 底部 API 详情。

## 部署

```bash
# 直接运行
npm start

# Docker
docker compose up

# CLI 管理
node bin/agent-ctl.mjs status
node bin/agent-ctl.mjs hook-off FileDeleteGuard
```

## 测试

```bash
npm test  # 23 项 API 集成测试
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口 (默认 3000) |
| `AGENT_TELEMETRY_TOKEN` | API 认证 Token |
| `ALERT_WEBHOOK_URL` | 告警通知 Webhook |

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | TypeScript · Node.js · Express · better-sqlite3 |
| 前端 | 单文件 HTML · ECharts · 全中文 UI |
| Python SDK | 纯标准库 (urllib) · 零依赖 |
| 部署 | Docker · docker compose |
| 测试 | 23 项集成测试 · npm test |

## 项目结构

```
agent-core-demo/
├── src/core/          # 5 层引擎 (9 个模块)
├── src/hooks/         # 护栏规则 (10 个 Hook)
├── src/server.ts      # Express API (14 端点)
├── public/            # Dashboard 面板
├── python-sdk/        # Python 客户端
│   ├── red_team.py    # 安全红队 (15 攻击向量)
│   └── langchain_demo.py  # LangChain 集成演示
├── scripts/           # PPT 生成等工具
├── test/              # 集成测试
├── Dockerfile & docker-compose.yml
└── bin/agent-ctl.mjs  # CLI 工具
```

## License

Proprietary — All rights reserved.
