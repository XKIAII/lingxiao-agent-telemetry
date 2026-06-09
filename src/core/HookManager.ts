// ============================================================
// 第 3 层：护栏层 — HookManager
// Pre/Post 拦截器 + JSON 配置热加载
// ============================================================

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { HookDefinition, HookContext, HookResult, HookMatch } from '../types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '../../data/hooks.json')

export interface HookEvent {
  hookName: string
  hookType: string
  priority: number
  action: string
  allowed: boolean
  reason?: string
}

export class HookManager {
  private hooks: HookDefinition[] = []

  register(hook: HookDefinition): void {
    this.hooks.push(hook)
    this.hooks.sort((a, b) => a.priority - b.priority)
    this.applyConfig()
    console.log(`[HookManager] ✅ 注册 Hook: ${hook.name} (${hook.type}, p${hook.priority})`)
  }

  unregister(name: string): void {
    const before = this.hooks.length
    this.hooks = this.hooks.filter((h) => h.name !== name)
    if (this.hooks.length < before) {
      console.log(`[HookManager] 🗑 移除 Hook: ${name}`)
    }
  }

  /**
   * 执行 pre-hooks，任一返回 allowed=false 则阻断
   * 返回执行结果和触发事件列表
   */
  async executePre(ctx: HookContext): Promise<{ allowed: boolean; reason?: string; events: HookEvent[] }> {
    const preHooks = this.hooks.filter(
      (h) => h.type === 'pre' && h.enabled && this.matchHook(h.match, ctx)
    )
    const events: HookEvent[] = []

    for (const hook of preHooks) {
      const result = await hook.handler(ctx)
      if (result.shared) {
        Object.assign(ctx.shared, result.shared)
      }
      const event: HookEvent = {
        hookName: hook.name, hookType: 'pre', priority: hook.priority,
        action: `${ctx.skill}.${ctx.action}`, allowed: result.allowed, reason: result.reason,
      }
      events.push(event)
      if (!result.allowed) {
        console.log(`[HookManager] ⛔ PreHook "${hook.name}" 阻断: ${result.reason}`)
        return { allowed: false, reason: result.reason, events }
      }
      console.log(`[HookManager] ✅ PreHook "${hook.name}" 通过`)
    }

    return { allowed: true, events }
  }

  /**
   * 执行 post-hooks，不可阻断，仅记录和副作用
   * 返回触发事件列表
   */
  async executePost(ctx: HookContext): Promise<HookEvent[]> {
    const postHooks = this.hooks.filter(
      (h) => h.type === 'post' && h.enabled && this.matchHook(h.match, ctx)
    )
    const events: HookEvent[] = []

    for (const hook of postHooks) {
      const result = await hook.handler(ctx)
      if (result.shared) {
        Object.assign(ctx.shared, result.shared)
      }
      events.push({
        hookName: hook.name, hookType: 'post', priority: hook.priority,
        action: `${ctx.skill}.${ctx.action}`, allowed: true,
      })
      console.log(`[HookManager] 📝 PostHook "${hook.name}" 完成`)
    }

    return events
  }

  /**
   * 通配符匹配
   * { skill: '*', action: '*' } → 匹配全部
   * { skill: 'order', action: '*' } → 匹配所有 order 动作
   * { skill: 'order', action: 'create' } → 精确匹配
   */
  private matchHook(match: HookMatch, ctx: HookContext): boolean {
    const skillMatch = match.skill === '*' || match.skill === ctx.skill
    const actionMatch = match.action === '*' || match.action === ctx.action
    return skillMatch && actionMatch
  }

  getAll(): HookDefinition[] {
    return [...this.hooks]
  }

  // ========== 热加载配置 ==========

  getConfig(): any {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    } catch {
      return { hooks: {} }
    }
  }

  applyConfig(): void {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      if (!config.hooks) return
      for (const h of this.hooks) {
        const cfg = config.hooks[h.name]
        if (cfg && typeof cfg.enabled === 'boolean') {
          h.enabled = cfg.enabled
        }
      }
    } catch { /* config file not found, use defaults */ }
  }

  reloadConfig(): boolean {
    try {
      this.applyConfig()
      console.log('[HookManager] 🔄 配置已重载')
      return true
    } catch (e) {
      console.error('[HookManager] ❌ 配置重载失败:', e)
      return false
    }
  }

  saveConfig(config: { hooks: Record<string, { enabled: boolean }> }): boolean {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...this.getConfig(), hooks: config.hooks }, null, 2))
      this.applyConfig()
      return true
    } catch {
      return false
    }
  }

  getStats(): { pre: number; post: number; total: number } {
    const pre = this.hooks.filter((h) => h.type === 'pre').length
    const post = this.hooks.filter((h) => h.type === 'post').length
    return { pre, post, total: this.hooks.length }
  }
}
