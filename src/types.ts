// ============================================================
// 第 0 层：共享类型定义
// 5 层架构所有模块共用的基础类型
// ============================================================

// --- Skill 接口（知识层）---
export interface SkillAction {
  name: string
  description: string
  handler: (params: ActionParams, context: ActionContext) => Promise<ActionResult>
}

export interface Skill {
  name: string
  version: string
  description: string
  triggers: string[]
  actions: Record<string, SkillAction>
}

export interface SkillManifest {
  name: string
  version: string
  description: string
  triggers: string[]
  actions: string[]
}

// --- Hook 接口（护栏层）---
export type HookType = 'pre' | 'post'

export interface HookMatch {
  skill: string   // 'order' | '*'
  action: string  // 'create' | '*'
}

export interface HookDefinition {
  name: string
  type: HookType
  match: HookMatch
  priority: number
  enabled: boolean
  handler: (ctx: HookContext) => Promise<HookResult>
}

export interface HookContext {
  skill: string
  action: string
  params: ActionParams
  user?: UserInfo
  actionResult?: ActionResult
  shared: Record<string, unknown>
  timestamp: string
  durationMs: number
}

export interface HookResult {
  allowed: boolean
  reason?: string
  shared?: Record<string, unknown>
}

// --- 插件接口（分发层）---
export interface Plugin {
  name: string
  version: string
  install: (core: AgentCore) => void | Promise<void>
  uninstall: () => void | Promise<void>
  skills?: Skill[]
  hooks?: HookDefinition[]
}

// --- 子智能体接口（委派层）---
export interface SubAgentTask {
  id: string
  type: string
  params: Record<string, unknown>
}

export interface SubAgentResult {
  taskId: string
  success: boolean
  data?: unknown
  error?: string
}

export interface SubAgentWorker {
  name: string
  capabilities: string[]
  execute: (task: SubAgentTask) => Promise<SubAgentResult>
}

// --- RuleEngine 类型 ---
export interface StatusTransitionRule {
  entity: string
  fromStatus: string
  toStatuses: string[]
  roles?: string[]
}

export interface BusinessRule {
  name: string
  description: string
  skills?: string[]  // 可选：限定适用范围，不填则全局
  validate: (params: Record<string, unknown>) => RuleValidationResult
}

export interface RuleValidationResult {
  valid: boolean
  message?: string
  errors?: string[]
}

// --- 公共类型 ---
export type ActionPath = string    // e.g. 'file-manager.create'
export type ActionParams = Record<string, unknown>

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  code?: string
}

export interface ActionContext {
  user?: UserInfo
  startTime: number
}

export interface UserInfo {
  uid: string
  username: string
  role: string
}

// --- Agent 配置（记忆层）---
export interface AgentConfig {
  name: string
  description: string
  owner: string
  defaultRole: string
  logDirectory: string
  maxSubAgents: number
  subAgentTimeoutMs: number
  auditEnabled: boolean
}

// --- AgentCore 开放接口 ---
export interface AgentCore {
  // Dispatch
  dispatch(actionPath: ActionPath, params: ActionParams): Promise<ActionResult>

  // Skill 管理
  registerSkill(skill: Skill): void
  unregisterSkill(name: string): void
  getSkillManifests(): SkillManifest[]

  // Hook 管理
  registerHook(hook: HookDefinition): void
  unregisterHook(name: string): void
  getHooks(): HookDefinition[]

  // 插件管理
  installPlugin(plugin: Plugin): void | Promise<void>
  uninstallPlugin(name: string): void | Promise<void>

  // 子智能体
  spawnSubAgent(task: SubAgentTask): Promise<SubAgentResult>
  registerWorker(worker: SubAgentWorker): void

  // 配置
  getConfig(): AgentConfig
  updateConfig(partial: Partial<AgentConfig>): void
  setUser(user: UserInfo): void

  // 审计日志
  getAuditLog(): AuditEntry[]
  clearAuditLog(): void
}

export interface AuditEntry {
  id?: number
  timestamp: string
  actionPath: string
  params: ActionParams
  result: Pick<ActionResult, 'success' | 'error'>
  user?: string
  durationMs: number
  hooksTriggered: number
  hooksBlocked: number
  tokens?: number
  cost?: number
  model?: string
}
