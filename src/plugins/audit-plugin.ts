// ============================================================
// 第 5 层：分发层 — 示例插件
// 演示 Plugin 的安装/卸载生命周期
// ============================================================

import type { Plugin, AgentCore, Skill, HookDefinition, ActionContext, ActionParams, ActionResult } from '../types'

const counter = { value: 0 }

const CounterSkill: Skill = {
  name: 'counter',
  version: '1.0.0',
  description: '由 audit-plugin 提供的计数器 Skill',
  triggers: ['计数器', '计数'],
  actions: {
    increment: {
      name: 'increment',
      description: '计数器 +1',
      handler: async (params: ActionParams, _ctx: ActionContext): Promise<ActionResult> => {
        const step = (params.step as number) || 1
        counter.value += step
        return { success: true, data: { value: counter.value } }
      },
    },
    get: {
      name: 'get',
      description: '获取计数器值',
      handler: async (_params: ActionParams, _ctx: ActionContext): Promise<ActionResult> => {
        return { success: true, data: { value: counter.value } }
      },
    },
    reset: {
      name: 'reset',
      description: '重置计数器',
      handler: async (_params: ActionParams, _ctx: ActionContext): Promise<ActionResult> => {
        counter.value = 0
        return { success: true, data: { value: 0 } }
      },
    },
  },
}

const PluginCounterHook: HookDefinition = {
  name: 'PluginCounterAudit',
  type: 'post',
  match: { skill: 'counter', action: '*' },
  priority: 50,
  enabled: true,
  handler: async (ctx) => {
    console.log(`  [Plugin Audit] counter.${ctx.action} → ${counter.value}`)
    return { allowed: true }
  },
}

export const AuditPlugin: Plugin = {
  name: 'audit-plugin',
  version: '1.0.0',
  skills: [CounterSkill],
  hooks: [PluginCounterHook],

  install: async (core: AgentCore) => {
    console.log('[audit-plugin] 安装中...')
    // 插件可以做额外的初始化工作
    // 例如：注册额外的业务规则、启动定时任务
  },

  uninstall: async () => {
    console.log('[audit-plugin] 卸载中...')
    counter.value = 0
  },
}
