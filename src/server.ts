// ============================================================
// Phase 1+2: Express API + 静态 Dashboard + Token 认证
// ============================================================

import express from 'express'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import type { SQLiteAuditStore } from './core/SQLiteAuditStore'
import type { DispatchBus } from './core/DispatchBus'
import { GuardService } from './guard/GuardService'
import { AlertEngine } from './core/AlertEngine'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '../public')

const AUTH_TOKEN = process.env.AGENT_TELEMETRY_TOKEN || ''
const AUTH_ENABLED = AUTH_TOKEN.length > 0

const alertEngine = new AlertEngine()

export function getAuthToken(): string { return AUTH_TOKEN }

export function createApiServer(store: SQLiteAuditStore, hooks: any[], core: DispatchBus) {
  const app = express()
  app.use(express.json())

  // === Token 认证中间件 ===
  app.use('/api', (req, res, next) => {
    if (!AUTH_ENABLED) return next()
    const header = req.headers.authorization || ''
    const param = (req.query.token as string) || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : param
    if (token === AUTH_TOKEN) return next()
    res.status(401).json({ error: '未授权', hint: '使用 Authorization: Bearer <token> 或 ?token=<token>' })
  })

  // === 静态文件（Dashboard） — 不受认证限制 ===
  app.use(express.static(publicDir))

  // === 统计摘要（支持 ?hours=1|24 & ?days=7|30 & ?agent=xxx） ===
  app.get('/api/stats', (req, res) => {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : (req.query.days ? undefined : undefined)
    const agent = req.query.agent as string || undefined
    const stats = store.getStats(hours, agent)
    const hookStats = {
      total: hooks.length,
      pre: hooks.filter((h: any) => h.type === 'pre').length,
      post: hooks.filter((h: any) => h.type === 'post').length,
    }
    res.json({ ...stats, hooks: hookStats })
  })

  // === 审计日志列表（分页 + 时间范围） ===
  app.get('/api/audit', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const offset = parseInt(req.query.offset as string) || 0
    const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined
    const agent = req.query.agent as string || undefined
    const logs = store.queryLogs(limit, offset, hours, agent)
    res.json({ data: logs, limit, offset })
  })

  // === 最近操作 ===
  app.get('/api/audit/recent', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)
    const agent = req.query.agent as string || undefined
    res.json(store.getRecent(limit, agent))
  })

  // === 单条审计详情 ===
  app.get('/api/audit/:id', (req, res) => {
    const entry = store.getById(parseInt(req.params.id))
    entry ? res.json(entry) : res.status(404).json({ error: 'not found' })
  })

  // === Hook 统计（真实数据） ===
  app.get('/api/hook-stats', (_req, res) => {
    res.json(store.getHookStats())
  })

  // === 时间线数据 ===
  app.get('/api/timeline', (req, res) => {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined
    const agent = req.query.agent as string || undefined
    res.json(store.getTimeline(hours, agent))
  })

  // === Agent 列表 ===
  app.get('/api/agents', (_req, res) => {
    res.json(store.getAgents())
  })

  // === Hook 列表 ===
  app.get('/api/hooks', (_req, res) => {
    res.json(hooks.map((h: any) => ({
      name: h.name,
      type: h.type,
      priority: h.priority,
      match: h.match,
    })))
  })

  // === 成本摘要 ===
  app.get('/api/cost', (req, res) => {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined
    const agent = req.query.agent as string || undefined
    res.json(store.getCostSummary(hours, agent))
  })

  // === 按 Agent 成本 ===
  app.get('/api/cost/by-agent', (req, res) => {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined
    const agent = req.query.agent as string || undefined
    res.json(store.getCostByAgent(hours, agent))
  })

  // === 合规报告 ===
  app.get('/api/compliance/report', (req, res) => {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined
    const agent = req.query.agent as string || undefined
    res.json(store.getComplianceReport(hours, agent))
  })

  // === 健康检查 ===
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // === 外部 Agent 遥测：双步上报（推荐）===

  // Step 1: LLM 调用前上报，获取 event_id
  app.post('/api/telemetry/pre', (req, res) => {
    try {
      const { agent, model, messages, timestamp } = req.body
      if (!agent) {
        return res.status(400).json({ error: '缺少必填字段', hint: '请提供 agent 字段', details: { missing: ['agent'] } })
      }
      const eventId = store.insertPre({ agent, model, messages, timestamp })
      res.json({ event_id: eventId, recorded: true })
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  })

  // Step 2: LLM 调用后上报，通过 event_id 关联
  app.post('/api/telemetry/post', (req, res) => {
    try {
      const { event_id, agent, model, response, tokens, cost, timestamp } = req.body
      if (!event_id || !agent) {
        return res.status(400).json({ error: '缺少必填字段', hint: '请提供 event_id 和 agent 字段', details: { missing: [!event_id && 'event_id', !agent && 'agent'].filter(Boolean) } })
      }
      const ok = store.updatePost({ event_id, agent, model, response, tokens: tokens?.total || tokens, cost, timestamp })
      if (!ok) {
        return res.status(404).json({ error: 'event_id 不存在', hint: '请确认 event_id 是否正确，且 pre 已成功上报' })
      }
      // 每次上报后检查告警条件
      const stats = store.getStats(1)
      const hookData = store.getHookStats()
      alertEngine.check(stats.totalOps, stats.blockedOps, hookData.recentBlocks)
      res.json({ recorded: true })
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  })

  // === 外部 Agent 遥测上报（单步，兼容简单场景）===
  app.post('/api/telemetry/report', (req, res) => {
    try {
      const { agent, phase, actionPath, params, result, hookCheck, user, durationMs, tokens, cost, model } = req.body
      if (!agent || !phase || !actionPath) {
        return res.status(400).json({ error: '缺少必填字段: agent, phase, actionPath' })
      }
      const id = store.insertExternalTelemetry({ agent, phase, actionPath, params, result, hookCheck, user, durationMs, tokens, cost, model })
      // 每次上报后检查告警条件
      const stats = store.getStats(1) // 过去1小时统计
      const hookData = store.getHookStats()
      alertEngine.check(stats.totalOps, stats.blockedOps, hookData.recentBlocks)
      res.json({ id, recorded: true })
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  })

  // === 安全护栏检查（外部 Agent 调用） ===
  const guardService = new GuardService()
  guardService.onAudit((result, input) => {
    // 审计记录：每次护栏检查都记入日志
    store.insertExternalTelemetry({
      agent: 'guard-service',
      phase: 'pre',
      actionPath: 'guard/check',
      params: { contentLength: input.length, detections: result.detections.length },
      result: { success: result.allowed, error: result.allowed ? undefined : result.reason },
      durationMs: result.durationMs,
    })
  })

  app.post('/api/guard/check', (req, res) => {
    try {
      const { content, context } = req.body || {}
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: '缺少必填字段', hint: '请提供 content 字段（字符串）' })
      }
      const result = guardService.check(content, context)
      res.json(result)
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get('/api/guard/rules', (_req, res) => {
    res.json({ rules: guardService.getRules() })
  })

  app.post('/api/guard/rules/toggle', (req, res) => {
    try {
      const { name, enabled } = req.body || {}
      if (!name) return res.status(400).json({ error: '缺少 name 字段' })
      const ok = guardService.setRuleEnabled(name, enabled)
      res.json({ success: ok, rule: name, enabled })
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  })

  // === Hook 配置（热加载） ===
  app.get('/api/hooks-config', (_req, res) => {
    res.json(core.hooks.getConfig())
  })

  app.post('/api/hooks-config', (req, res) => {
    const { hooks: hookConfig } = req.body || {}
    if (!hookConfig || typeof hookConfig !== 'object') {
      return res.status(400).json({ error: '缺少 hooks 字段' })
    }
    const ok = core.hooks.saveConfig({ hooks: hookConfig })
    res.json({ success: ok, message: ok ? '配置已保存并生效' : '保存失败' })
  })

  app.post('/api/hooks-config/reload', (_req, res) => {
    const ok = core.hooks.reloadConfig()
    res.json({ success: ok })
  })

  // === 告警状态 ===
  app.get('/api/alerts', (_req, res) => {
    res.json(alertEngine.getState())
  })

  app.post('/api/alerts/acknowledge', (_req, res) => {
    alertEngine.acknowledge()
    res.json({ acknowledged: true })
  })

  // === 触发测试操作 ===
  app.post('/api/demo/trigger', async (_req, res) => {
    const results: any[] = []
    const ops = [
      ['file-manager.create', { name: 'test.txt', content: 'demo' }],
      ['counter.increment', { step: 1 }],
      ['git-helper.commit', { repo: 'demo', message: 'auto trigger' }],
      ['file-manager.delete', { name: 'package.json' }], // 会被拦截
    ]
    for (const [path, params] of ops) {
      const r = await core.dispatch(path as string, params as any)
      results.push({ action: path, success: r.success, message: r.message || r.error })
    }
    res.json({ triggered: results.length, results })
  })

  return app
}
