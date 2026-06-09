// ============================================================
// 第 1 层：记忆层 — ConfigRegistry
// 对应 CLAUDE.md，存储 Agent 行为规则、用户偏好、环境配置
// ============================================================

import type { AgentConfig } from '../types'

const DEFAULT_CONFIG: AgentConfig = {
  name: '凌霄 Agent',
  description: '基于 Claude Code 5 层架构的智能体运行时',
  owner: '哥哥',
  defaultRole: 'developer',
  logDirectory: './logs',
  maxSubAgents: 5,
  subAgentTimeoutMs: 30_000,
  auditEnabled: true,
}

export class ConfigRegistry {
  private config: AgentConfig

  constructor(overrides: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...overrides }
  }

  get(): Readonly<AgentConfig> {
    return this.config
  }

  update(partial: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...partial }
  }

  getValue<K extends keyof AgentConfig>(key: K): AgentConfig[K] {
    return this.config[key]
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG }
  }
}
