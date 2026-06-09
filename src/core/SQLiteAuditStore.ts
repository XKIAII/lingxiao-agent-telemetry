// ============================================================
// Phase 2.5: SQLite 审计存储 — 增强版
// 新增：时间范围查询、Hook 事件写入、时间线查询
// ============================================================

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import type { AuditEntry } from '../types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../../data/agent-audit.db')

const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

export class SQLiteAuditStore {
  private db: Database.Database

  constructor() {
    this.db = new Database(DB_PATH)
    this.init()
  }

  private init(): void {
    this.db.exec('PRAGMA journal_mode=WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        timestamp TEXT NOT NULL,
        action_path TEXT NOT NULL,
        params TEXT,
        success INTEGER NOT NULL,
        error TEXT,
        username TEXT,
        user_role TEXT,
        duration_ms INTEGER,
        hooks_triggered INTEGER DEFAULT 0,
        hooks_blocked INTEGER DEFAULT 0
      )
    `)
    // 迁移：添加成本追踪字段（如果已存在则忽略错误）
    for (const sql of [
      'ALTER TABLE audit_logs ADD COLUMN tokens INTEGER DEFAULT 0',
      'ALTER TABLE audit_logs ADD COLUMN cost REAL DEFAULT 0',
      'ALTER TABLE audit_logs ADD COLUMN model TEXT DEFAULT \'\'',
      'ALTER TABLE audit_logs ADD COLUMN event_id TEXT DEFAULT \'\'',
      'ALTER TABLE audit_logs ADD COLUMN response TEXT DEFAULT \'\'',
    ]) { try { this.db.exec(sql) } catch (_) {} }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id INTEGER,
        hook_name TEXT NOT NULL,
        hook_type TEXT NOT NULL,
        priority INTEGER,
        action TEXT NOT NULL,
        allowed INTEGER,
        reason TEXT,
        timestamp TEXT NOT NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action_path)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_event_id ON audit_logs(event_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_hook_name ON hook_events(hook_name)`)
  }

  insertLog(entry: AuditEntry, sessionId: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (session_id, timestamp, action_path, params, success, error, username, user_role, duration_ms, hooks_triggered, hooks_blocked, tokens, cost, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    return Number(stmt.run(
      sessionId, entry.timestamp, entry.actionPath, JSON.stringify(entry.params),
      entry.result.success ? 1 : 0, entry.result.error || null, entry.user || null, null,
      entry.durationMs, entry.hooksTriggered, entry.hooksBlocked,
      entry.tokens || 0, entry.cost || 0, entry.model || ''
    ).lastInsertRowid)
  }

  // 写入 Hook 事件
  insertHookEvent(auditId: number, hookName: string, hookType: string, priority: number, action: string, allowed: boolean, reason?: string): void {
    this.db.prepare(`INSERT INTO hook_events (audit_id, hook_name, hook_type, priority, action, allowed, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(auditId, hookName, hookType, priority, action, allowed ? 1 : 0, reason || null, new Date().toISOString())
  }

  // 获取时间过滤条件 — 支持 hours 和 days 两种模式
  private timeFilter(hours?: number, days?: number): string {
    if (days) {
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString()
      return `timestamp >= '${since}'`
    }
    if (!hours) return '1=1'
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
    return `timestamp >= '${since}'`
  }

  private agentFilter(agent?: string): string {
    if (!agent) return '1=1'
    // 兼容两种 session_id 格式：
    //   insertPre: 'ext-{agent}'（无后缀）
    //   insertLog: 'ext-{agent}-{timestamp}'（有后缀）
    return `(session_id LIKE 'ext-${agent}-%' OR session_id = 'ext-${agent}')`
  }

  private allFilters(hours?: number, days?: number, agent?: string): string {
    return `${this.timeFilter(hours, days)} AND ${this.agentFilter(agent)}`
  }

  // 获取所有已注册的 Agent 列表
  getAgents(): string[] {
    const rows = this.db.prepare(
      "SELECT DISTINCT session_id FROM audit_logs WHERE session_id LIKE 'ext-%'"
    ).all() as any[]
    const agents = new Set<string>()
    for (const r of rows) {
      const m = r.session_id.match(/^ext-(.+?)(?:-\d{13,}|-0)$/)
      if (m) agents.add(m[1])
    }
    return [...agents]
  }

  // 写入 Pre 事件（LLM 调用前），返回 event_id
  insertPre(data: {
    agent: string; model?: string; messages?: any[]; timestamp?: string;
  }): string {
    const eventId = `pre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ts = data.timestamp || new Date().toISOString()
    this.db.prepare(`
      INSERT INTO audit_logs
        (session_id, timestamp, action_path, params, success, error, username, duration_ms, model, event_id)
      VALUES (?, ?, 'llm/call', ?, 0, NULL, ?, 0, ?, ?)
    `).run(
      `ext-${data.agent}`,
      ts,
      JSON.stringify({ messages: data.messages || [] }),
      data.agent,
      data.model || '',
      eventId,
    )
    return eventId
  }

  // 写入 Post 事件（LLM 调用后），通过 event_id 关联 Pre 事件
  updatePost(data: {
    event_id: string; agent: string; model?: string;
    response?: any; tokens?: number; cost?: number; timestamp?: string;
  }): boolean {
    const pre = this.db.prepare('SELECT timestamp FROM audit_logs WHERE event_id = ?').get(data.event_id) as any
    if (!pre) return false
    const preMs = new Date(pre.timestamp).getTime()
    const postMs = data.timestamp ? new Date(data.timestamp).getTime() : Date.now()
    const durationMs = Math.max(0, postMs - preMs)
    const result = this.db.prepare(`
      UPDATE audit_logs
      SET response = ?, tokens = ?, cost = ?, duration_ms = ?, success = 1
      WHERE event_id = ?
    `).run(
      JSON.stringify(data.response || {}),
      data.tokens || 0,
      data.cost || 0,
      durationMs,
      data.event_id,
    )
    return result.changes > 0
  }

  // 外部遥测上报（来自任意 Agent，如 WorkBuddy / LangChain / CrewAI）
  insertExternalTelemetry(data: {
    agent: string; phase: 'pre' | 'post';
    actionPath: string; params?: any; result?: any;
    hookCheck?: { passed: boolean; reason?: string };
    user?: string; durationMs?: number;
    tokens?: number; cost?: number; model?: string;
  }  ): number {
    const ts = new Date().toISOString()
    const blocked = data.phase === 'pre' && data.hookCheck?.passed === false
    const error = blocked ? data.hookCheck!.reason : (data.result?.error || null)
    const success = !blocked && data.result?.success !== false
    const auditId = this.insertLog({
      timestamp: ts, actionPath: data.actionPath, params: data.params || {},
      result: { success, error }, user: data.user || data.agent || '外部Agent',
      durationMs: data.durationMs || 0,
      hooksTriggered: 1, hooksBlocked: blocked ? 1 : 0,
      tokens: data.tokens || 0, cost: data.cost || 0, model: data.model || '',
    }, `ext-${data.agent}-${Date.now()}`)

    // 记录 Hook 事件（外部遥测也算 Hook 触发）
    const hookName = blocked ? (data.hookCheck!.reason?.includes('SQL') ? 'SQLInjectionDetector'
      : data.hookCheck!.reason?.includes('XSS') ? 'XSSDetector'
      : data.hookCheck!.reason?.includes('路径') ? 'PathTraversalDetector'
      : data.hookCheck!.reason?.includes('Key') || data.hookCheck!.reason?.includes('敏感') || data.hookCheck!.reason?.includes('密钥') ? 'SecretDetector'
      : data.hookCheck!.reason?.includes('删除') || data.hookCheck!.reason?.includes('保护') ? 'FileDeleteGuard'
      : data.hookCheck!.reason?.includes('非法') || data.hookCheck!.reason?.includes('文件名') ? 'FileNameValidator'
      : data.hookCheck!.reason?.includes('鉴权') || data.hookCheck!.reason?.includes('权限') ? 'GlobalAuthGuard'
      : 'AuditTrail') : 'AuditTrail'

    this.db.prepare(`
      INSERT INTO hook_events (audit_id, hook_name, hook_type, priority, action, allowed, reason, timestamp)
      VALUES (?, ?, 'pre', ?, ?, ?, ?, ?)
    `).run(auditId, hookName, blocked ? 1 : 10, data.actionPath, blocked ? 0 : 1,
      blocked ? data.hookCheck!.reason : null, ts)

    return auditId
  }

  queryLogs(limit: number = 50, offset: number = 0, hours?: number, agent?: string): AuditEntry[] {
    const filter = this.allFilters(hours, undefined, agent)
    const rows = this.db.prepare(
      `SELECT * FROM audit_logs WHERE ${filter} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as any[]
    return this.mapRows(rows)
  }

  getRecent(limit: number = 20, agent?: string): AuditEntry[] {
    return this.queryLogs(limit, 0, undefined, agent)
  }

  getStats(hours?: number, agent?: string): any {
    const filter = this.allFilters(hours, undefined, agent)
    const total = this.db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE ${filter}`).get() as any
    const success = this.db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE ${filter} AND success = 1`).get() as any
    const failed = this.db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE ${filter} AND success = 0 AND error IS NOT NULL`).get() as any
    const avgDur = this.db.prepare(`SELECT AVG(duration_ms) as avg FROM audit_logs WHERE ${filter}`).get() as any
    const topActions = this.db.prepare(
      `SELECT action_path as action, COUNT(*) as count, SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as fails FROM audit_logs WHERE ${filter} GROUP BY action_path ORDER BY count DESC LIMIT 10`
    ).all() as any[]
    const hourly = this.db.prepare(
      `SELECT substr(timestamp, 12, 2) as hour, COUNT(*) as count, SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as blocked FROM audit_logs WHERE ${filter} GROUP BY hour ORDER BY hour`
    ).all() as any[]
    const byModel = this.db.prepare(
      `SELECT model, COUNT(*) as calls, SUM(tokens) as tokens, SUM(duration_ms) as total_ms
       FROM audit_logs WHERE ${filter} AND model != '' GROUP BY model ORDER BY calls DESC`
    ).all() as any[]
    const byAgent = this.db.prepare(
      `SELECT username, COUNT(*) as calls, SUM(tokens) as tokens, SUM(duration_ms) as total_ms
       FROM audit_logs WHERE ${filter} AND username IS NOT NULL GROUP BY username ORDER BY calls DESC`
    ).all() as any[]

    return {
      totalOps: total.c,
      successOps: success.c,
      blockedOps: failed.c,
      errorOps: total.c - success.c - (failed.c || 0),
      avgDurationMs: Math.round(avgDur.avg || 0),
      topActions: topActions.map((r: any) => ({ action: r.action, count: r.count, fails: r.fails })),
      hourlyBreakdown: hourly.map((r: any) => ({ hour: `${r.hour}:00`, count: r.count, blocked: r.blocked })),
      byModel: byModel.map((r: any) => ({ model: r.model, calls: r.calls, tokens: r.tokens, totalMs: r.total_ms })),
      byAgent: byAgent.map((r: any) => ({ agent: r.username, calls: r.calls, tokens: r.tokens, totalMs: r.total_ms })),
    }
  }

  // Hook 触发统计
  getHookStats(): any {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM hook_events').get() as any
    const byHook = this.db.prepare(
      'SELECT hook_name as name, hook_type as type, COUNT(*) as count, SUM(CASE WHEN allowed=0 THEN 1 ELSE 0 END) as blocks FROM hook_events GROUP BY hook_name ORDER BY count DESC'
    ).all() as any[]
    const recentBlocks = this.db.prepare(
      "SELECT h.*, a.action_path FROM hook_events h LEFT JOIN audit_logs a ON h.audit_id = a.id WHERE h.allowed = 0 ORDER BY h.id DESC LIMIT 10"
    ).all() as any[]
    return {
      total: total.c,
      byHook: byHook.map((r: any) => ({ name: r.name, type: r.type, count: r.count, blocks: r.blocks })),
      recentBlocks: recentBlocks.map((r: any) => ({
        hook: r.hook_name, action: r.action_path || r.action, reason: r.reason, time: r.timestamp,
      })),
    }
  }

  // 按分钟聚合的时间线（用于折线图）
  getTimeline(hours?: number, agent?: string): any[] {
    const filter = this.allFilters(hours, undefined, agent)
    const rows = this.db.prepare(`
      SELECT substr(datetime(timestamp, '+8 hours'), 12, 5) as minute, COUNT(*) as total,
        SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failed
      FROM audit_logs WHERE ${filter} GROUP BY minute ORDER BY minute
    `).all() as any[]
    return rows.map((r: any) => ({ minute: r.minute, total: r.total, success: r.success, failed: r.failed }))
  }

  // 单条详情
  getById(id: number): AuditEntry | null {
    const row = this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id) as any
    if (!row) return null
    return this.mapRows([row])[0]
  }

  // 成本摘要
  getCostSummary(hours?: number, agent?: string): any {
    const filter = this.allFilters(hours, undefined, agent)
    const row = this.db.prepare(`
      SELECT SUM(tokens) as totalTokens, SUM(cost) as totalCost, COUNT(*) as calls,
        AVG(cost) as avgCost
      FROM audit_logs WHERE ${filter}
    `).get() as any
    const byModel = this.db.prepare(`
      SELECT model, SUM(tokens) as tokens, SUM(cost) as cost, COUNT(*) as calls
      FROM audit_logs WHERE ${filter} AND model != ''
      GROUP BY model ORDER BY cost DESC
    `).all() as any[]
    const hourly = this.db.prepare(`
      SELECT substr(datetime(timestamp, '+8 hours'), 12, 5) as minute, SUM(cost) as cost, SUM(tokens) as tokens
      FROM audit_logs WHERE ${filter}
      GROUP BY minute ORDER BY minute
    `).all() as any[]
    return {
      totalTokens: row.totalTokens || 0,
      totalCost: (row.totalCost || 0).toFixed(4),
      totalCalls: row.calls || 0,
      avgCost: ((row.avgCost || 0)).toFixed(6),
      byModel,
      hourlyCost: hourly.map((r: any) => ({ minute: r.minute, cost: r.cost || 0, tokens: r.tokens || 0 })),
    }
  }

  // 按 Agent 维度的成本统计
  getCostByAgent(hours?: number, agent?: string): any {
    const filter = this.allFilters(hours, undefined, agent)
    const rows = this.db.prepare(`
      SELECT username as agent, SUM(tokens) as tokens, SUM(cost) as cost, COUNT(*) as calls,
        AVG(duration_ms) as avgDuration
      FROM audit_logs WHERE ${filter} AND username IS NOT NULL
      GROUP BY username ORDER BY cost DESC
    `).all() as any[]
    return rows.map((r: any) => ({
      agent: r.agent,
      tokens: r.tokens || 0,
      cost: (r.cost || 0).toFixed(4),
      calls: r.calls,
      avgDurationMs: Math.round(r.avgDuration || 0),
    }))
  }

  // 合规报告
  getComplianceReport(hours?: number, agent?: string): any {
    const filter = this.allFilters(hours, undefined, agent)
    const stats = this.getStats(hours, agent)
    const hookStats = this.getHookStats()

    // 越权操作（被拦截的操作）
    const blockedOps = this.db.prepare(`
      SELECT action_path as action, username, timestamp, error as reason
      FROM audit_logs WHERE ${filter} AND success = 0 AND error IS NOT NULL
      ORDER BY id DESC LIMIT 20
    `).all() as any[]

    // 按动作分类统计
    const byAction = this.db.prepare(`
      SELECT action_path as action, COUNT(*) as total,
        SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failed
      FROM audit_logs WHERE ${filter}
      GROUP BY action_path ORDER BY total DESC LIMIT 10
    `).all() as any[]

    // 安全评分
    const score = Math.round((stats.successOps / Math.max(stats.totalOps, 1)) * 100)
    const grade = score >= 95 ? 'A' : score >= 80 ? 'B' : score >= 60 ? 'C' : 'D'

    // 敏感信息检测事件
    const secrets = this.db.prepare(
      "SELECT * FROM hook_events WHERE hook_name = 'SecretDetector' AND allowed = 0 ORDER BY id DESC LIMIT 10"
    ).all() as any[]

    return {
      generatedAt: new Date().toISOString(),
      period: hours ? `${hours}h` : 'all',
      agent: agent || '全部',
      summary: {
        totalOps: stats.totalOps,
        successRate: stats.totalOps > 0 ? ((stats.successOps / stats.totalOps) * 100).toFixed(1) + '%' : '0%',
        blockedOps: stats.blockedOps,
        securityScore: score,
        securityGrade: grade,
        hooksActive: hookStats.total,
        secretsDetected: secrets.length,
      },
      blockedOperations: blockedOps,
      topActions: byAction,
      hookDetails: hookStats,
      recentSecrets: secrets.map((s: any) => ({
        hook: s.hook_name, action: s.action, reason: s.reason, time: s.timestamp,
      })),
    }
  }

  private mapRows(rows: any[]): AuditEntry[] {
    return rows.map((r: any) => ({
      id: r.id,
      timestamp: r.timestamp,
      actionPath: r.action_path,
      params: JSON.parse(r.params || '{}'),
      result: { success: !!r.success, error: r.error },
      user: r.username,
      durationMs: r.duration_ms,
      hooksTriggered: r.hooks_triggered,
      hooksBlocked: r.hooks_blocked,
    }))
  }

  close(): void {
    this.db.close()
  }
}
