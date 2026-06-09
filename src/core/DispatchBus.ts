// ============================================================
// 第 1+2+3 层联动：DispatchBus — 编排器
// 核心调度链路：resolve skill → pre-hooks → action → post-hooks
// ============================================================

import type {
  AgentCore,
  AgentConfig,
  ActionParams,
  ActionResult,
  AuditEntry,
  UserInfo,
  ActionContext,
  Skill,
  HookDefinition,
  SkillManifest,
  SubAgentTask,
  SubAgentResult,
  SubAgentWorker,
  Plugin,
} from '../types'
import { ConfigRegistry } from './ConfigRegistry'
import { RuleEngine } from './RuleEngine'
import { SkillRegistry } from './SkillRegistry'
import { HookManager } from './HookManager'
import { SubAgentManager } from './SubAgentManager'
import { PluginManager } from './PluginManager'
import type { SQLiteAuditStore } from './SQLiteAuditStore'

export class DispatchBus implements AgentCore {
  public config: ConfigRegistry
  public rules: RuleEngine
  public skills: SkillRegistry
  public hooks: HookManager
  public subAgents: SubAgentManager
  public plugins: PluginManager

  private currentUser: UserInfo | undefined
  private auditLog: AuditEntry[] = []
  private auditStore: SQLiteAuditStore | null = null
  private sessionId: string

  constructor(configOverrides: Partial<AgentConfig> = {}, auditStore?: SQLiteAuditStore) {
    this.config = new ConfigRegistry(configOverrides)
    this.rules = new RuleEngine()
    this.skills = new SkillRegistry()
    this.hooks = new HookManager()
    this.subAgents = new SubAgentManager(this.config.get())
    this.plugins = new PluginManager()
    this.auditStore = auditStore || null
    this.sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    if (this.auditStore) {
      console.log(`[DispatchBus] 📊 审计存储已激活 (SQLite)`)
    }
  }

  // ==================== 核心调度 ====================

  async dispatch(actionPath: string, params: ActionParams): Promise<ActionResult> {
    const startTime = Date.now()
    let auditId = 0

    // 1. 解析 actionPath
    const resolved = this.skills.resolve(actionPath)
    if (!resolved) {
      return { success: false, error: `未找到 Skill: ${actionPath}`, code: 'SKILL_NOT_FOUND' }
    }

    const { skill, skillName, actionName } = resolved

    // 2. 构建 Hook 上下文
    const ctx = {
      skill: skillName,
      action: actionName,
      params,
      user: this.currentUser,
      shared: {},
      timestamp: new Date().toISOString(),
      durationMs: 0,
    }

    // 3. 执行 Pre-Hooks（可阻断）
    const preResult = await this.hooks.executePre(ctx)
    if (!preResult.allowed) {
      this.writeHookEvents(preResult.events, auditId)
      const blockedEntry: AuditEntry = {
        timestamp: new Date().toISOString(), actionPath, params,
        result: { success: false, error: preResult.reason || '操作被拦截' },
        user: this.currentUser?.username, durationMs: Date.now() - startTime,
        hooksTriggered: preResult.events.length, hooksBlocked: 1,
      }
      this.writeAudit(blockedEntry)
      return { success: false, error: preResult.reason || '操作被拦截', code: 'HOOK_BLOCKED' }
    }

    // 4. 执行业务规则校验
    const ruleResult = this.rules.validateBusiness(params, skillName)
    if (!ruleResult.valid) {
      this.writeHookEvents(preResult.events, auditId)
      const blockedEntry: AuditEntry = {
        timestamp: new Date().toISOString(), actionPath, params,
        result: { success: false, error: ruleResult.message },
        user: this.currentUser?.username, durationMs: Date.now() - startTime,
        hooksTriggered: preResult.events.length, hooksBlocked: 1,
      }
      this.writeAudit(blockedEntry)
      return { success: false, error: ruleResult.message, code: 'RULE_VIOLATION' }
    }

    // 5. 执行 Skill Action
    const actionContext: ActionContext = { user: this.currentUser, startTime }
    let result: ActionResult
    try {
      result = await skill.actions[actionName].handler(params, actionContext)
    } catch (err: any) {
      result = { success: false, error: err.message, code: 'ACTION_ERROR' }
    }

    // 6. 更新上下文并执行 Post-Hooks（不可阻断）
    ctx.actionResult = result
    ctx.durationMs = Date.now() - startTime
    const postEvents = await this.hooks.executePost(ctx)

    // 7. 记录审计
    const allEvents = [...preResult.events, ...postEvents]
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(), actionPath, params,
      result: { success: result.success, error: result.error },
      user: this.currentUser?.username, durationMs: ctx.durationMs,
      hooksTriggered: allEvents.length, hooksBlocked: 0,
    }
    auditId = this.writeAudit(entry)
    this.writeHookEvents(allEvents, auditId)

    return result
  }

  private writeAudit(entry: AuditEntry): number {
    this.auditLog.push(entry)
    if (this.auditStore) {
      try { return this.auditStore.insertLog(entry, this.sessionId) } catch (_) { return 0 }
    }
    return 0
  }

  private writeHookEvents(events: any[], auditId: number): void {
    if (!this.auditStore || !events.length) return
    try {
      for (const e of events) {
        this.auditStore.insertHookEvent(auditId, e.hookName, e.hookType, e.priority, e.action, e.allowed, e.reason)
      }
    } catch (_) {}
  }

  // ==================== Skill 管理 ====================

  registerSkill(skill: Skill): void {
    this.skills.register(skill)
  }

  unregisterSkill(name: string): void {
    this.skills.unregister(name)
  }

  getSkillManifests(): SkillManifest[] {
    return this.skills.getManifests()
  }

  // ==================== Hook 管理 ====================

  registerHook(hook: HookDefinition): void {
    this.hooks.register(hook)
  }

  unregisterHook(name: string): void {
    this.hooks.unregister(name)
  }

  getHooks(): HookDefinition[] {
    return this.hooks.getAll()
  }

  // ==================== 插件管理 ====================

  async installPlugin(plugin: Plugin): Promise<void> {
    await this.plugins.install(plugin, this)
  }

  async uninstallPlugin(name: string): Promise<void> {
    await this.plugins.uninstall(name)
  }

  // ==================== 子智能体 ====================

  async spawnSubAgent(task: SubAgentTask): Promise<SubAgentResult> {
    return this.subAgents.execute(task)
  }

  registerWorker(worker: SubAgentWorker): void {
    this.subAgents.registerWorker(worker)
  }

  // ==================== 配置 ====================

  getConfig(): AgentConfig {
    return this.config.get() as AgentConfig
  }

  updateConfig(partial: Partial<AgentConfig>): void {
    this.config.update(partial)
  }

  setUser(user: UserInfo): void {
    this.currentUser = user
    console.log(`[DispatchBus] 👤 当前用户: ${user.username} (${user.role})`)
  }

  // ==================== 审计 ====================

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog]
  }

  clearAuditLog(): void {
    this.auditLog = []
  }

  // ==================== 诊断 ====================

  status(): string {
    const cfg = this.config.get()
    const hookStats = this.hooks.getStats()
    return [
      `\n═══════════════════════════════════════`,
      `  🧠 ${cfg.name}`,
      `  Owner: ${cfg.owner}`,
      `  Skills: ${this.skills.size()}`,
      `  Hooks: ${hookStats.total} (pre:${hookStats.pre} post:${hookStats.post})`,
      `  Plugins: ${this.plugins.count()}`,
      `  Workers: ${this.subAgents.workerCount()}`,
      `  Audit: ${this.auditLog.length} entries`,
      `═══════════════════════════════════════\n`,
    ].join('\n')
  }
}
