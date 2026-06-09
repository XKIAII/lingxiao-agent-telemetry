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

  // 获取时间过滤条件
  private timeFilter(hours?: number): string {
    if (!hours) return '1=1'
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
    return `timestamp >= '${since}'`
  }

  private agentFilter(agent?: string): string {
    if (!agent) return '1=1'
    return `session_id LIKE 'ext-${agent}-%' OR session_id LIKE 'ext-${agent}'`
  }

  private allFilters(hours?: number, agent?: string): string {
    return `${this.timeFilter(hours)} AND ${this.agentFilter(agent)}`
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

  // 外部遥测上报（来自任意 Agent，如 WorkBuddy / LangChain / CrewAI）
  insertExternalTelemetry(data: {
    agent: string; phase: 'pre' | 'post';
    actionPath: string; params?: any; result?: any;
    hookCheck?: { passed: boolean; reason?: string };
    user?: string; durationMs?: number;
    tokens?: number; cost?: number; model?: string;
  }): number {
    const ts = new Date().toISOString()
    const blocked = data.phase === 'pre' && data.hookCheck?.passed === false
    const error = blocked ? data.hookCheck!.reason : (data.result?.error || null)
    const success = !blocked && data.result?.success !== false
    return this.insertLog({
      timestamp: ts, actionPath: data.actionPath, params: data.params || {},
      result: { success, error }, user: data.user || data.agent || '外部Agent',
      durationMs: data.durationMs || 0,
      hooksTriggered: 1, hooksBlocked: blocked ? 1 : 0,
      tokens: data.tokens || 0, cost: data.cost || 0, model: data.model || '',
    }, `ext-${data.agent}-${Date.now()}`)
  }

  queryLogs(limit: number = 50, offset: number = 0, hours?: number, agent?: string): AuditEntry[] {
    const filter = this.allFilters(hours, agent)
    const rows = this.db.prepare(
      `SELECT * FROM audit_logs WHERE ${filter} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as any[]
    return this.mapRows(rows)
  }

  getRecent(limit: number = 20, agent?: string): AuditEntry[] {
    return this.queryLogs(limit, 0, undefined, agent)
  }

  getStats(hours?: number, agent?: string): any {
    const filter = this.allFilters(hours, agent)
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

    return {
      totalOps: total.c,
      successOps: success.c,
      blockedOps: failed.c,
      errorOps: total.c - success.c - (failed.c || 0),
      avgDurationMs: Math.round(avgDur.avg || 0),
      topActions: topActions.map((r: any) => ({ action: r.action, count: r.count, fails: r.fails })),
      hourlyBreakdown: hourly.map((r: any) => ({ hour: `${r.hour}:00`, count: r.count, blocked: r.blocked })),
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
    const filter = this.allFilters(hours, agent)
    const rows = this.db.prepare(`
      SELECT substr(timestamp, 12, 5) as minute, COUNT(*) as total,
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
    const filter = this.allFilters(hours, agent)
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
      SELECT substr(timestamp, 12, 5) as minute, SUM(cost) as cost, SUM(tokens) as tokens
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

  // 合规报告
  getComplianceReport(hours?: number, agent?: string): any {
    const filter = this.allFilters(hours, agent)
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
