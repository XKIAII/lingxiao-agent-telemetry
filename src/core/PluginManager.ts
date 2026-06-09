// ============================================================
// 第 5 层：分发层 — PluginManager
// MCP 连接器管理，支持插件的安装/卸载生命周期
// ============================================================

import type { AgentCore, Plugin } from '../types'

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map()

  /**
   * 安装插件：安装 → 注册其 Skills → 注册其 Hooks
   */
  async install(plugin: Plugin, core: AgentCore): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[PluginManager] 插件 "${plugin.name}" 已安装，跳过`)
      return
    }

    console.log(`[PluginManager] 📦 安装插件: ${plugin.name}@${plugin.version}`)

    // 调用插件的 install 钩子
    await plugin.install(core)

    // 注册插件自带的 Skills
    if (plugin.skills) {
      for (const skill of plugin.skills) {
        core.registerSkill(skill)
      }
    }

    // 注册插件自带的 Hooks
    if (plugin.hooks) {
      for (const hook of plugin.hooks) {
        core.registerHook(hook)
      }
    }

    this.plugins.set(plugin.name, plugin)
    console.log(`[PluginManager] ✅ 插件 "${plugin.name}" 安装完成`)
  }

  /**
   * 卸载插件
   */
  async uninstall(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      console.warn(`[PluginManager] 插件 "${name}" 未安装`)
      return
    }

    console.log(`[PluginManager] 🗑 卸载插件: ${name}`)
    await plugin.uninstall()
    this.plugins.delete(name)
  }

  count(): number {
    return this.plugins.size
  }
}
