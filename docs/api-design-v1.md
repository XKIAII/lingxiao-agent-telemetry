# 凌霄 HTTP API 设计方案 v1

> 目标：任何语言、任何框架的 Agent 只需发 HTTP 请求即可接入凌霄，无需 SDK。

---

## 一、核心设计原则

1. **极简接入**：2 个请求即可完成一次 LLM 调用的遥测上报
2. **双步设计**：pre → post，服务端计算耗时，支持追踪进行中请求
3. **单步兼容**：保留 `/report` 供简单场景使用
4. **无认证门槛**：默认无需 Token 即可上报（可配置开启）
5. **清晰错误提示**：每个错误返回明确 message 和 hint

---

## 二、API 端点设计

### 2.1 双步上报（推荐）

#### `POST /api/telemetry/pre`
LLM 调用**前**上报，获取 `event_id`。

**请求 Body：**
```json
{
  "agent": "my-agent",           // 必填，Agent 名称
  "model": "gpt-4o",           // 选填，模型名称
  "messages": [                  // 选填，请求 messages
    {"role": "user", "content": "..."}
  ],
  "timestamp": "2026-06-09T10:00:00.000Z"  // 选填，默认当前时间
}
```

**响应：**
```json
{
  "event_id": "pre-1717929600000-a1b2",
  "recorded": true
}
```

---

#### `POST /api/telemetry/post`
LLM 调用**后**上报，关联 `event_id`。

**请求 Body：**
```json
{
  "event_id": "pre-1717929600000-a1b2",  // 必填，来自 pre 响应
  "agent": "my-agent",                     // 必填
  "model": "gpt-4o",                     // 选填
  "response": {                           // 选填，LLM 响应内容
    "content": "...",
    "finish_reason": "stop"
  },
  "tokens": {                             // 选填，token 用量
    "prompt": 100,
    "completion": 50,
    "total": 150
  },
  "cost": 0.001,                        // 选填，成本（USD）
  "timestamp": "2026-06-09T10:00:05.000Z"  // 选填
}
```

**响应：**
```json
{
  "recorded": true,
  "duration_ms": 5230
}
```

---

### 2.2 单步上报（兼容/简单场景）

#### `POST /api/telemetry/report`
一次上报完整的 LLM 调用记录。

**请求 Body：**
```json
{
  "agent": "my-agent",
  "model": "gpt-4o",
  "messages": [...],
  "response": {...},
  "duration_ms": 5230,
  "tokens": { "total": 150 },
  "cost": 0.001
}
```

**响应：**
```json
{
  "id": 42,
  "recorded": true
}
```

---

## 三、查询 API（Dashboard 用）

| 端点 | 说明 |
|---|---|
| `GET /api/telemetry?agent=xxx&hours=24&limit=50` | 查询遥测记录 |
| `GET /api/stats?agent=xxx&hours=24` | 统计摘要 |
| `GET /api/agents` | 已接入 Agent 列表 |
| `GET /api/health` | 健康检查 |

---

## 四、任意语言接入示例

### Python（无 SDK，纯 HTTP）
```python
import requests, time, json

BASE = "http://localhost:3000"

# 第一步：pre
pre_resp = requests.post(f"{BASE}/api/telemetry/pre", json={
    "agent": "my-python-agent",
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
})
event_id = pre_resp.json()["event_id"]

# 调用 LLM（伪代码）
# response = openai.chat.completions.create(...)

# 第二步：post
requests.post(f"{BASE}/api/telemetry/post", json={
    "event_id": event_id,
    "agent": "my-python-agent",
    "model": "gpt-4o",
    "response": {"content": "Hi there!"},
    "tokens": {"total": 20},
    "cost": 0.0001
})
```

### Node.js（无 SDK，纯 fetch）
```javascript
const BASE = 'http://localhost:3000';

// 第一步：pre
const preResp = await fetch(`${BASE}/api/telemetry/pre`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'my-js-agent',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello' }]
  })
});
const { event_id } = await preResp.json();

// 调用 LLM...

// 第二步：post
await fetch(`${BASE}/api/telemetry/post`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    event_id,
    agent: 'my-js-agent',
    model: 'gpt-4o',
    response: { content: 'Hi there!' },
    tokens: { total: 20 },
    cost: 0.0001
  })
});
```

### curl（测试用）
```bash
# pre
curl -X POST http://localhost:3000/api/telemetry/pre \
  -H "Content-Type: application/json" \
  -d '{"agent":"test-agent","model":"gpt-4o"}'

# post（用上一步返回的 event_id）
curl -X POST http://localhost:3000/api/telemetry/post \
  -H "Content-Type: application/json" \
  -d '{"event_id":"PRE-XXX","agent":"test-agent","model":"gpt-4o","cost":0.001}'
```

---

## 五、错误码

| 状态码 | 含义 |
|---|---|
| 200 | 成功 |
| 400 | 请求体缺少必填字段 |
| 404 | event_id 不存在（post 时） |
| 429 | 上报频率超限 |
| 500 | 服务器内部错误 |

**错误响应格式：**
```json
{
  "error": "缺少必填字段",
  "hint": "请提供 agent 和 event_id",
  "details": {"missing": ["agent"]}
}
```

---

## 六、实施计划

1. ✅ 设计文档（本文件）
2. [ ] 修改 `SQLiteAuditStore.ts`：添加 `event_id` 字段，添加 `insertPre()` 和 `updatePost()` 方法
3. [ ] 修改 `server.ts`：添加 `/api/telemetry/pre` 和 `/api/telemetry/post` 端点
4. [ ] 更新 Python SDK（`lingxiao_callback.py`）：使用新端点
5. [ ] 测试：用 curl / Python 验证双步上报
6. [ ] 更新 Dashboard：显示进行中的请求（有 pre 无 post）
