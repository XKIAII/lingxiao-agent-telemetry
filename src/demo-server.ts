// ============================================================
// 🚀 Phase 1: Agent 遥测服务
// ============================================================
//
// 启动: npx tsx src/demo-server.ts
// API:  http://localhost:3000/api/stats
//       http://localhost:3000/api/audit
//       http://localhost:3000/api/hooks
//       http://localhost:3000/api/health
// ============================================================

import { DispatchBus } from './core/DispatchBus'
import { SQLiteAuditStore } from './core/SQLiteAuditStore'
import { FileManagerSkill } from './skills/file-manager'
import { GitHelperSkill } from './skills/git-helper'
import { CoreHooks } from './hooks/core-hooks'
import { SecretDetector } from './hooks/secret-detector'
import { SQLInjectionDetector, XSSDetector, PathTraversalDetector } from './hooks/security-hooks'
import { AuditPlugin } from './plugins/audit-plugin'
import { createApiServer, getAuthToken } from './server'
import type { SubAgentWorker, SubAgentTask, SubAgentResult } from './types'

// ==================== 初始化 ====================

console.log(`
╔══════════════════════════════════════════════╗
║  🚀 Agent 遥测服务 — Phase 1               ║
║  SQLite + Express API                      ║
╚══════════════════════════════════════════════╝
`)

// 创建 SQLite 存储
const auditStore = new SQLiteAuditStore()
console.log('[Server] ✅ SQLite 审计存储已就绪')

// 创建 Agent Core（带 SQLite 存储）
const core = new DispatchBus({
  name: '凌霄·遥测',
  owner: '哥哥',
}, auditStore)

core.setUser({ uid: 'u001', username: '哥哥', role: 'admin' })

// ==================== 第 1 层：记忆层 ====================

core.rules.addStatusRule({
  entity: 'order',
  fromStatus: 'pending',
  toStatuses: ['in_progress', 'cancelled', 'on_hold'],
})

core.rules.addBusinessRule({
  name: 'CustomerNameRequired',
  description: '客户名不能为空',
  skills: ['order'],
  validate: (params) => {
    if (!params.customer_name) {
      return { valid: false, message: '客户名不能为空' }
    }
    return { valid: true }
  },
})

// ==================== 第 2 层：知识层 ====================

core.registerSkill(FileManagerSkill)
core.registerSkill(GitHelperSkill)

// ==================== 第 3 层：护栏层 ====================

CoreHooks.forEach((h) => core.registerHook(h))
core.registerHook(SecretDetector)
core.registerHook(SQLInjectionDetector)
core.registerHook(XSSDetector)
core.registerHook(PathTraversalDetector)

// ==================== 第 5 层：分发层 ====================

await core.installPlugin(AuditPlugin)

// ==================== 第 4 层：委派层 ====================

core.registerWorker({
  name: 'data-analyzer',
  capabilities: ['analyze', 'report'],
  execute: async (task: SubAgentTask): Promise<SubAgentResult> => {
    return {
      taskId: task.id,
      success: true,
      data: `已分析数据，发现 ${Math.floor(Math.random() * 10) + 1} 个异常点`,
    }
  },
})

core.registerWorker({
  name: 'file-worker',
  capabilities: ['file-scan', 'file-process'],
  execute: async (task: SubAgentTask): Promise<SubAgentResult> => {
    return { taskId: task.id, success: true, data: { scanned: 42, processed: 42 } }
  },
})

// ==================== 演示数据生成（已关闭） ====================
// 使用 --demo 参数开启: npx tsx src/demo-server.ts --demo
const runDemo = process.argv.includes('--demo')

if (runDemo) {
  console.log('\n' + '═'.repeat(50))
  console.log('  🎬 生成遥测数据...')
  console.log('═'.repeat(50))

  console.log('\n▶ 正常操作:')
  await core.dispatch('file-manager.create', { name: 'readme.md', content: '# Hello' })
  await core.dispatch('file-manager.create', { name: 'config.json', content: '{}' })
  await core.dispatch('git-helper.init', { name: 'demo-repo' })
  await core.dispatch('git-helper.commit', { repo: 'demo-repo', message: 'init' })
  await core.dispatch('counter.increment', { step: 1 })
  await core.dispatch('counter.increment', { step: 2 })
  await core.dispatch('counter.get', {})

  console.log('\n▶ 被拦截操作（生成错误遥测）:')
  await core.dispatch('file-manager.delete', { name: 'package.json' })
  await core.dispatch('file-manager.create', { name: 'bad??file.txt', content: 'x' })

  console.log('\n▶ 子智能体:')
  await core.subAgents.executeAll([
    { id: 'task-1', type: 'analyze', params: {} },
    { id: 'task-2', type: 'file-scan', params: {} },
  ])
}

// ==================== 启动 API 服务 ====================

const PORT = 3000
const app = createApiServer(auditStore, core.getHooks(), core)

app.listen(PORT, () => {
  const token = getAuthToken()
  const authInfo = token ? `\n  🔐 Token 认证已启用: ${token.substring(0,12)}...` : '\n  ⚠  Token 未设置，认证已禁用（仅开发模式）'
  const dashboardUrl = token ? `http://localhost:${PORT}/dashboard.html?token=${token}` : `http://localhost:${PORT}/dashboard.html`
  console.log('\n' + '═'.repeat(50))
  console.log(`  🌐 Agent 可观测服务已启动${authInfo}`)
  console.log('═'.repeat(50))
  console.log(`\n  📊 Dashboard: ${dashboardUrl}`)
  console.log(`\n  API 端点:`)
  console.log(`    GET  /api/stats        — 统计摘要`)
  console.log(`    GET  /api/audit        — 审计日志（支持 ?limit=&offset=）`)
  console.log(`    GET  /api/audit/recent — 最近 20 条`)
  console.log(`    GET  /api/hooks        — Hook 清单`)
  console.log(`    GET  /api/health       — 健康检查`)
  console.log(`    POST /api/demo/trigger — 触发一次测试操作`)
  console.log(`    GET  /api/hooks-config — 查看 Hook 规则配置`)
  console.log(`    POST /api/hooks-config — 修改 Hook 规则`)
  console.log(`    POST /api/hooks-config/reload — 重载规则`)
  console.log(`    POST /api/telemetry/report — 外部 Agent 遥测上报`)
  console.log(`\n  💡 Dashboard: ${dashboardUrl}`)
  console.log(`  💡 CLI: node bin/agent-ctl.mjs status`)
  console.log(`  💡 Docker: docker compose up`)
  console.log(`\n  按 Ctrl+C 停止服务\n`)
})

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[Server] 正在关闭...')
  auditStore.close()
  process.exit(0)
})
