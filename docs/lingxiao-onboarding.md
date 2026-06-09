# 凌霄 — Agent 可观测平台接入指南

> **任何 Agent，3 行代码接入凌霄**  
> 只需 2 个 HTTP 请求，即可让任何语言/框架的 Agent 被凌霄观测。

---

## 一、概述

凌霄是 Agent 工具链基础设施层的可观测平台，提供：

- **LLM 调用追踪** — 记录每次模型调用的耗时、Token、模型名
- **工具调用审计** — 记录 Agent 调用的每个工具及参数
- **实时 Dashboard** — 可视化展示所有 Agent 的运行状态
- **费用统计** — 按 Token 用量自动计算成本
- **安全护栏** — 及时发现异常行为

**适用场景：**
- 你开发了一个 Agent，想看它每次 LLM 调用和工具调用的日志
- 你在用 LangChain、AutoGen、CrewAI 等框架，需要统一的观测面板
- 你想监控多个 Agent 的运行成本和性能

---

## 二、快速开始

### 启动凌霄服务

```bash
cd lingxiao-telemetry
PORT=3000 npx tsx src/demo-server.ts
```

启动后访问：`http://localhost:3000/dashboard.html`

### 接入你的 Agent

凌霄提供两种接入方式：

| 方式 | 适用场景 | 接入成本 |
|------|----------|----------|
| **HTTP API（推荐）** | 任何语言/框架 | 2 个 POST 请求 |
| **Python SDK** | Python + LangChain | 1 行代码 |

---

## 三、HTTP API 方式（通用，推荐）

任何语言、任何框架的 Agent，只需要在 LLM 调用前和后各发一个 HTTP 请求即可。

### 第 1 步：LLM 调用前上报

```http
POST /api/telemetry/pre
Content-Type: application/json

{
  "agent": "my-agent",
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "Hello, how are you?"}
  ]
}
```

**响应：** `{"event_id": "pre-1712345678-abc123", "recorded": true}`

请保存返回的 `event_id`，第 2 步需要用到。

### 第 2 步：LLM 调用后上报

```http
POST /api/telemetry/post
Content-Type: application/json

{
  "event_id": "pre-1712345678-abc123",
  "agent": "my-agent",
  "model": "gpt-4o",
  "response": {
    "content": "I'm doing well, thank you!",
    "tool_calls": ["get_weather"],
    "finish_reason": "tool_calls"
  },
  "tokens": 150
}
```

**响应：** `{"recorded": true}`

凌霄会自动计算两次上报的时间差作为 `duration_ms`（LLM 调用耗时）。

### 各语言接入示例

#### cURL

```bash
# Step 1: Pre
EVENT_ID=$(curl -s -X POST http://localhost:3000/api/telemetry/pre \
  -H "Content-Type: application/json" \
  -d '{"agent":"my-agent","model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['event_id'])")

# Step 2: Post
curl -s -X POST http://localhost:3000/api/telemetry/post \
  -H "Content-Type: application/json" \
  -d "{\"event_id\":\"$EVENT_ID\",\"agent\":\"my-agent\",\"response\":{\"content\":\"Hi!\"},\"tokens\":50}"
```

#### Python

```python
import requests

# Step 1: Pre
pre_resp = requests.post("http://localhost:3000/api/telemetry/pre", json={
    "agent": "my-agent",
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
})
event_id = pre_resp.json()["event_id"]

# ... 调用 LLM ...

# Step 2: Post
requests.post("http://localhost:3000/api/telemetry/post", json={
    "event_id": event_id,
    "agent": "my-agent",
    "response": {"content": "Hi!", "tool_calls": [], "finish_reason": "stop"},
    "tokens": 150,
})
```

#### Node.js

```javascript
// Step 1: Pre
const preRes = await fetch("http://localhost:3000/api/telemetry/pre", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ agent: "my-agent", model: "gpt-4o", messages: [{ role: "user", content: "Hello" }] })
});
const { event_id } = await preRes.json();

// Step 2: Post
await fetch("http://localhost:3000/api/telemetry/post", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ event_id, agent: "my-agent", response: { content: "Hi!" }, tokens: 150 })
});
```

#### Java (OkHttp)

```java
// Step 1: Pre
String json = "{\"agent\":\"my-agent\",\"model\":\"gpt-4o\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}";
Request preReq = new Request.Builder()
    .url("http://localhost:3000/api/telemetry/pre")
    .post(RequestBody.create(json, MediaType.get("application/json")))
    .build();
Response preResp = client.newCall(preReq).execute();
JSONObject preObj = new JSONObject(preResp.body().string());
String eventId = preObj.getString("event_id");

// Step 2: Post
String postJson = String.format(
    "{\"event_id\":\"%s\",\"agent\":\"my-agent\",\"response\":{\"content\":\"Hi!\"},\"tokens\":150}",
    eventId
);
Request postReq = new Request.Builder()
    .url("http://localhost:3000/api/telemetry/post")
    .post(RequestBody.create(postJson, MediaType.get("application/json")))
    .build();
client.newCall(postReq).execute();
```

#### Go

```go
// Step 1: Pre
preBody, _ := json.Marshal(map[string]interface{}{
    "agent": "my-agent", "model": "gpt-4o",
    "messages": []map[string]string{{"role": "user", "content": "Hello"}},
})
preResp, _ := http.Post("http://localhost:3000/api/telemetry/pre", "application/json", bytes.NewReader(preBody))
var preResult map[string]interface{}
json.NewDecoder(preResp.Body).Decode(&preResult)
eventId := preResult["event_id"].(string)

// Step 2: Post
postBody, _ := json.Marshal(map[string]interface{}{
    "event_id": eventId, "agent": "my-agent",
    "response": map[string]interface{}{"content": "Hi!"},
    "tokens": 150,
})
http.Post("http://localhost:3000/api/telemetry/post", "application/json", bytes.NewReader(postBody))
```

---

## 四、Python SDK 方式（LangChain 专用）

如果使用 Python + LangChain/LangGraph，只需一行代码即可集成。

### 安装

无需额外安装，`lingxiao_callback.py` 直接拷贝到你的项目中使用。

### 用法

```python
from langchain_openai import ChatOpenAI
from lingxiao_callback import LingXiaoObserver

# 1. 创建 LLM
llm = ChatOpenAI(model="gpt-4o", api_key="...")

# 2. 一行代码嵌入凌霄
llm = LingXiaoObserver.patch(llm, agent="my-agent")

# 3. 正常使用 LangChain Agent
from langgraph.prebuilt import create_agent
agent = create_agent(model=llm, tools=[...])
result = agent.invoke({"messages": [{"role": "user", "content": "Hello"}]})
# ✅ LLM 调用和工具调用会自动上报到凌霄
```

### 配置

`LingXiaoObserver.patch()` 支持以下参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `endpoint` | `http://localhost:3000` | 凌霄服务地址 |
| `token` | `None` | 认证 Token（如启用） |
| `agent` | `langchain-agent` | 你的 Agent 名称，用于 Dashboard 区分 |

通过环境变量配置更方便：

```bash
export LINGXIAO_ENDPOINT="http://localhost:3000"
export LINGXIAO_AGENT="my-agent"

# 然后运行 Agent
python run_agent.py --mode times
```

### 完整示例

参考 `lingxiao-demo-agent/` 目录下的完整 demo：

```bash
cd lingxiao-demo-agent
LINGXIAO_ENDPOINT="http://localhost:3000" \
  python src/agent_tool_pipeline.py --mode all
```

---

## 五、API 参考

### 端点一览

| 方法 | 路径 | 说明 | 必填字段 |
|------|------|------|----------|
| POST | `/api/telemetry/pre` | LLM 调用前上报 | `agent` |
| POST | `/api/telemetry/post` | LLM 调用后上报 | `event_id`, `agent` |
| POST | `/api/telemetry/report` | 单步上报（兼容旧版） | `agent`, `phase`, `actionPath` |
| GET | `/api/stats` | 统计摘要 | - |
| GET | `/api/audit` | 审计日志列表 | - |
| GET | `/api/audit/recent` | 最近操作 | - |
| GET | `/api/health` | 健康检查 | - |

### POST /api/telemetry/pre

**请求体：**

```json
{
  "agent": "string (必填) — 你的 Agent 名称",
  "model": "string (可选) — 模型名称，如 gpt-4o / deepseek-v4-flash",
  "messages": "array (可选) — 本轮输入的 messages，每个元素含 role 和 content",
  "timestamp": "string (可选) — ISO 8601 时间戳，不传则使用服务器时间"
}
```

**响应：**

```json
{
  "event_id": "pre-1712345678-abc123",
  "recorded": true
}
```

### POST /api/telemetry/post

**请求体：**

```json
{
  "event_id": "string (必填) — pre 返回的 event_id",
  "agent": "string (必填) — 必须与 pre 一致",
  "model": "string (可选) — 模型名称",
  "response": {
    "content": "string (可选) — LLM 返回内容摘要",
    "tool_calls": ["tool1", "tool2"],
    "finish_reason": "stop | tool_calls | error",
    "error": "string (失败时填写)"
  },
  "tokens": "integer (可选) — 本次调用的总 Token 数",
  "cost": "float (可选) — 本次调用的成本（美元）",
  "timestamp": "string (可选) — ISO 8601 时间戳"
}
```

**响应：**

```json
{
  "recorded": true
}
```

---

## 六、Dashboard 使用

访问 `http://localhost:3000/dashboard.html`，可以看到：

| 面板 | 说明 |
|------|------|
| **实时统计** | 总操作数、成功率、拦截率、平均耗时 |
| **Agent 视图** | 按 Agent 分组查看调用情况 |
| **时间线** | 按时间轴查看所有操作 |
| **成本统计** | Token 消耗和费用估算 |
| **告警状态** | 安全规则触发的告警信息 |

---

## 七、FAQ

**Q：凌霄和 LangSmith 有什么区别？**

凌霄专注于 Agent 工具链基础设施层，提供安全护栏、审计追踪、成本统计等能力，而不仅仅是 LLM 调用的追踪。

**Q：非 Python 的 Agent 怎么接入？**

使用 HTTP API。任何能发 HTTP 请求的语言都可以接入（见第三节的 Java/Go/Node.js 示例）。

**Q：凌霄支持哪些 Agent 框架？**

凌霄不绑定特定框架——它通过 HTTP API 或 Python SDK 工作，任何框架都能接入。已验证 LangChain/LangGraph，其他框架（AutoGen、CrewAI、OpenAI Agents SDK）原理相同。

**Q：数据存在哪里？**

默认使用 SQLite，数据文件位于 `lingxiao-telemetry/data/`。支持迁移到 PostgreSQL（需自行开发）。

**Q：部署在服务器上怎么使用？**

将 `lingxiao-telemetry` 部署到你的服务器，修改 `endpoint` 参数指向服务器地址即可。
