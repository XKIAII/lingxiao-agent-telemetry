// ============================================================
// API 集成测试
// 运行: npx tsx test/api.test.ts
// 测试前需先启动服务: npm start
// ============================================================

const BASE = 'http://localhost:3000'

interface TestCase {
  name: string
  fn: () => Promise<boolean>
}

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn()
    if (ok) { passed++; console.log(`  ✅ ${name}`) }
    else { failed++; failures.push(name); console.log(`  ❌ ${name}`) }
  } catch (e: any) {
    failed++; failures.push(name)
    console.log(`  ❌ ${name} — ${e.message?.substring(0, 60)}`)
  }
}

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`)
  return { status: r.status, data: await r.json() }
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: r.status, data: await r.json() }
}

// ========== 测试用例 ==========

async function runTests() {
  console.log('\n🔬 API 集成测试\n' + '═'.repeat(40))

  // 1. 基础端点
  await test('GET /api/health', async () => {
    const { data } = await get('/api/health')
    return data.status === 'ok' && !!data.timestamp
  })

  // 2. 统计
  await test('GET /api/stats', async () => {
    const { data } = await get('/api/stats')
    return typeof data.totalOps === 'number' && data.hooks
  })

  await test('GET /api/stats?hours=1', async () => {
    const { data } = await get('/api/stats?hours=1')
    return typeof data.totalOps === 'number'
  })

  // 3. 审计
  await test('GET /api/audit', async () => {
    const { data } = await get('/api/audit?limit=5')
    return Array.isArray(data.data) && data.limit === 5
  })

  await test('GET /api/audit/recent', async () => {
    const d = await get('/api/audit/recent?limit=3')
    return Array.isArray(d.data)
  })

  // 4. 单条详情 (取第一条审计记录的ID)
  let firstId = 0
  await test('GET /api/audit/:id', async () => {
    const { data } = await get('/api/audit?limit=1')
    if (data.data.length > 0) {
      firstId = data.data[0].id
      const r = await get(`/api/audit/${firstId}`)
      return r.data.actionPath && r.data.timestamp
    }
    return true // 空数据库不算失败
  })

  // 5. 时间线
  await test('GET /api/timeline', async () => {
    const d = await get('/api/timeline')
    return Array.isArray(d.data)
  })

  // 6. Hook
  await test('GET /api/hooks', async () => {
    const d = await get('/api/hooks')
    return Array.isArray(d.data) && d.data.length >= 5
  })

  await test('GET /api/hooks-config', async () => {
    const d = await get('/api/hooks-config')
    return d.data.hooks && d.data.meta
  })

  await test('GET /api/hook-stats', async () => {
    const d = await get('/api/hook-stats')
    return typeof d.data.total === 'number' && Array.isArray(d.data.byHook)
  })

  // 7. 成本
  await test('GET /api/cost', async () => {
    const d = await get('/api/cost')
    return typeof d.data.totalCost === 'string' && typeof d.data.totalTokens === 'number'
  })

  // 8. 合规报告
  await test('GET /api/compliance/report', async () => {
    const d = await get('/api/compliance/report')
    return d.data.summary && d.data.summary.securityScore >= 0
  })

  // 9. Agent 列表
  await test('GET /api/agents', async () => {
    const d = await get('/api/agents')
    return Array.isArray(d.data)
  })

  // 10. 告警
  await test('GET /api/alerts', async () => {
    const d = await get('/api/alerts')
    return typeof d.data.alerted === 'boolean' && d.data.threshold
  })

  // 11. 遥测上报
  await test('POST /api/telemetry/report (pre)', async () => {
    const { status, data } = await post('/api/telemetry/report', {
      agent: 'test-suite', phase: 'pre',
      actionPath: 'test.run',
      params: { suite: 'api-test' },
      hookCheck: { passed: true },
    })
    return status === 200 && data.recorded === true
  })

  await test('POST /api/telemetry/report (post)', async () => {
    const { status, data } = await post('/api/telemetry/report', {
      agent: 'test-suite', phase: 'post',
      actionPath: 'test.run',
      result: { success: true },
      durationMs: 42, tokens: 100, cost: 0.001,
    })
    return status === 200 && data.recorded === true
  })

  await test('POST /api/telemetry/report (blocked)', async () => {
    const { status, data } = await post('/api/telemetry/report', {
      agent: 'test-suite', phase: 'pre',
      actionPath: 'test.blocked',
      params: { dangerous: true },
      hookCheck: { passed: false, reason: '测试拦截' },
    })
    return status === 200 && data.recorded === true
  })

  // 12. Hook 配置修改
  await test('POST /api/hooks-config (toggle)', async () => {
    const { status, data } = await post('/api/hooks-config', {
      hooks: { AuditTrail: { enabled: true } },
    })
    return status === 200 && data.success === true
  })

  // 13. 告警确认
  await test('POST /api/alerts/acknowledge', async () => {
    const { data } = await post('/api/alerts/acknowledge', {})
    return data.acknowledged === true
  })

  // 14. Agent 过滤
  await test('GET /api/stats?agent=test-suite', async () => {
    const d = await get('/api/stats?agent=test-suite')
    return typeof d.data.totalOps === 'number'
  })

  await test('GET /api/cost?agent=test-suite', async () => {
    const d = await get('/api/cost?agent=test-suite')
    return typeof d.data.totalCost === 'string'
  })

  // 15. 遥测参数校验
  await test('POST /api/telemetry/report (missing fields)', async () => {
    const { status, data } = await post('/api/telemetry/report', {})
    return status === 400 && data.error
  })

  // 16. 演示触发
  await test('POST /api/demo/trigger', async () => {
    const { status, data } = await post('/api/demo/trigger', {})
    return status === 200 && data.triggered === 4
  })

  // 结果
  console.log('\n' + '═'.repeat(40))
  console.log(`  通过: ${passed}/${passed + failed}`)
  if (failures.length > 0) {
    console.log(`  失败:`)
    failures.forEach(f => console.log(`    - ${f}`))
  }
  console.log()
}

runTests()
