# 凌霄 — Agent 可观测平台

基于 Claude Code 5 层智能体架构的 Agent 安全护栏 + 可观测性产品原型。

## 5 层架构

```
记忆层 (CLAUDE.md)     ConfigRegistry + RuleEngine
知识层 (SKILLS)        SkillRegistry — 可复用能力单元
护栏层 (HOOKS)         HookManager — Pre/Post 拦截器
委派层 (子智能体)       SubAgentManager — 并行任务分发
分发层 (插件/MCP)       PluginManager — 第三方集成
```

## 快速开始

```bash
# 1. 启动遥测服务
npm install
npm start

# 2. 打开 Dashboard
open http://localhost:3000/dashboard.html

# 3. 运行安全红队测试 (生成演示数据)
cd python-sdk
python red_team.py
```

## Dashboard 功能

- **KPI 面板**：总操作数、成功率、Hook 拦截数、平均延迟
- **操作时序图**：按分钟聚合，成功/失败分色叠柱
- **Hook 触发统计**：每个 Hook 的触发次数和拦截次数
- **实时审计日志**：点击行查看完整 params/result
- **最近拦截记录**：被拦截的操作及原因
- **告警横幅**：拦截率超标时红色告警
- **时间范围选择**：All / 1h / 24h
- **多 Agent 筛选**：按 Agent 来源过滤数据

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats?hours=&agent=` | 统计摘要 |
| GET | `/api/audit?limit=&offset=&hours=&agent=` | 审计日志 |
| GET | `/api/audit/recent?limit=&agent=` | 最近操作 |
| GET | `/api/audit/:id` | 单条详情 |
| GET | `/api/timeline?hours=&agent=` | 时序数据 |
| GET | `/api/hook-stats` | Hook 统计 |
| GET | `/api/hooks` | Hook 清单 |
| GET | `/api/hooks-config` | 规则配置 |
| POST | `/api/hooks-config` | 修改规则 |
| POST | `/api/hooks-config/reload` | 重载规则 |
| GET | `/api/agents` | Agent 列表 |
| GET | `/api/alerts` | 告警状态 |
| POST | `/api/telemetry/report` | 外部遥测上报 |

## Python SDK

```python
from agent_telemetry import TelemetryMiddleware

tm = TelemetryMiddleware(endpoint="http://localhost:3000", agent="my-agent")

# 装饰器
@tm.trace(action="llm.chat")
def chat(prompt): ...

# 上下文管理器
with tm.span("agent.search", params={"query": "..."}):
    results = do_search()

# 直接上报
tm.client.report_pre("tool.run", {"cmd": "..."})
```

## 安全红队

```bash
cd python-sdk
python red_team.py
```

12 条攻击向量覆盖 5 个类别：文件安全、命令注入、数据泄露、权限提升、资源滥用。自动生成安全评分报告。

## 部署

### 直接运行
```bash
npm start
```

### Docker
```bash
docker compose up
```

### CLI
```bash
node bin/agent-ctl.mjs start    # 启动
node bin/agent-ctl.mjs status   # 状态
node bin/agent-ctl.mjs hooks    # 规则配置
node bin/agent-ctl.mjs hook-off FileDeleteGuard  # 禁用 Hook
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `AGENT_TELEMETRY_TOKEN` | API 认证 Token | 空（认证禁用） |
| `ALERT_WEBHOOK_URL` | 告警 Webhook | 空 |

## 项目结构

```
agent-core-demo/
├── src/
│   ├── core/              # 5层引擎
│   │   ├── ConfigRegistry.ts
│   │   ├── RuleEngine.ts
│   │   ├── SkillRegistry.ts
│   │   ├── HookManager.ts
│   │   ├── SubAgentManager.ts
│   │   ├── PluginManager.ts
│   │   ├── DispatchBus.ts
│   │   ├── SQLiteAuditStore.ts
│   │   └── AlertEngine.ts
│   ├── skills/            # 示例 Skill
│   ├── hooks/             # 护栏规则
│   ├── plugins/           # 插件
│   ├── server.ts          # Express API
│   └── demo-server.ts     # 启动脚本
├── public/
│   └── dashboard.html     # 前端面板
├── data/
│   ├── hooks.json         # Hook 规则配置
│   └── agent-audit.db     # SQLite 数据库
├── bin/
│   └── agent-ctl.mjs      # CLI 工具
├── python-sdk/            # Python SDK
│   ├── agent_telemetry/
│   ├── example.py
│   └── red_team.py
├── Dockerfile
└── docker-compose.yml
```

## License

Proprietary — All rights reserved.
