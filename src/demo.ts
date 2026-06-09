// ============================================================
// 🧠 Agent Core Demo — Claude Code 5 层架构完整演示
// ============================================================
//
// 运行: npx tsx src/demo.ts
//
// 演示内容:
//   1. 记忆层 — Agent 配置 + 规则引擎
//   2. 知识层 — 注册 Skills (file-manager, git-helper)
//   3. 护栏层 — Pre/Post Hooks 拦截与审计
//   4. 委派层 — 子智能体并行任务
//   5. 分发层 — 插件安装与卸载
// ============================================================

import { DispatchBus } from './core/DispatchBus'
import { FileManagerSkill } from './skills/file-manager'
import { GitHelperSkill } from './skills/git-helper'
import { CoreHooks } from './hooks/core-hooks'
import { AuditPlugin } from './plugins/audit-plugin'
import type { SubAgentWorker, SubAgentTask, SubAgentResult } from './types'

// ==================== 初始化 ====================

console.log(`
╔══════════════════════════════════════════════╗
║  🧠 Agent Core Demo — 5 层架构演示         ║
║  基于 Claude Code Toolkit 设计             ║
╚══════════════════════════════════════════════╝
`)

const core = new DispatchBus({
  name: '凌霄',
  owner: '哥哥',
})

// 设置用户
core.setUser({ uid: 'u001', username: '哥哥', role: 'admin' })

// ==================== 第 1 层：记忆层 ====================

console.log('━'.repeat(40))
console.log('📋 第 1 层：记忆层 — 检查配置')
console.log('━'.repeat(40))

console.log(core.status())

// 注册状态流转规则（RuleEngine）
core.rules.addStatusRule({
  entity: 'order',
  fromStatus: 'pending',
  toStatuses: ['in_progress', 'cancelled', 'on_hold'],
})

const transitionResult = core.rules.validateTransition('order', 'pending', 'in_progress')
console.log(`  状态流转校验: ${transitionResult.valid ? '✅' : '❌'} ${transitionResult.message}`)

// 注册业务规则（仅作用于 order skill）
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

// 演示状态流转失败
const failTransition = core.rules.validateTransition('order', 'completed', 'pending')
console.log(`  状态流转校验(非法): ${failTransition.valid ? '✅' : '❌'} ${failTransition.message}`)

// ==================== 第 2 层：知识层 ====================

console.log('\n' + '━'.repeat(40))
console.log('📚 第 2 层：知识层 — 注册 Skills')
console.log('━'.repeat(40))

core.registerSkill(FileManagerSkill)
core.registerSkill(GitHelperSkill)

console.log(`\n  Skill 清单:`)
for (const m of core.getSkillManifests()) {
  console.log(`    - ${m.name}@${m.version}: ${m.description}`)
}

// ==================== 第 3 层：护栏层 ====================

console.log('\n' + '━'.repeat(40))
console.log('🛡 第 3 层：护栏层 — 注册 Hooks')
console.log('━'.repeat(40))

CoreHooks.forEach((h) => core.registerHook(h))

console.log(`\n  Hook 清单:`)
for (const h of core.getHooks()) {
  console.log(
    `    [${h.type.toUpperCase()}] ${h.name} — p${h.priority} — ${h.match.skill}.${h.match.action}`
  )
}

// ==================== 第 5 层：分发层（先安装插件） ====================

console.log('\n' + '━'.repeat(40))
console.log('🔌 第 5 层：分发层 — 安装插件')
console.log('━'.repeat(40))

await core.installPlugin(AuditPlugin)

// ==================== 第 4 层：委派层 ====================

console.log('\n' + '━'.repeat(40))
console.log('🤖 第 4 层：委派层 — 注册 Worker')
console.log('━'.repeat(40))

// Worker 1: 数据分析 Worker
const dataWorker: SubAgentWorker = {
  name: 'data-analyzer',
  capabilities: ['analyze', 'report'],
  execute: async (task: SubAgentTask): Promise<SubAgentResult> => {
    console.log(`    [data-analyzer] 处理任务 ${task.id}...`)
    return {
      taskId: task.id,
      success: true,
      data: `已分析数据，发现 ${Math.floor(Math.random() * 10) + 1} 个异常点`,
    }
  },
}

// Worker 2: 文件 Worker
const fileWorker: SubAgentWorker = {
  name: 'file-worker',
  capabilities: ['file-scan', 'file-process'],
  execute: async (task: SubAgentTask): Promise<SubAgentResult> => {
    console.log(`    [file-worker] 处理任务 ${task.id}...`)
    return {
      taskId: task.id,
      success: true,
      data: { scanned: 42, processed: 42 },
    }
  },
}

core.registerWorker(dataWorker)
core.registerWorker(fileWorker)

// ==================== 运行演示 ====================

console.log('\n' + '═'.repeat(50))
console.log('  🎬 运行演示：5 层协同工作')
console.log('═'.repeat(50))

// --- 演示 1: 正常操作 ---
console.log('\n▶ 演示 1: 正常创建文件')
console.log('  预期: pre-hooks 全部通过，action 执行，post-hooks 审计')
const r1 = await core.dispatch('file-manager.create', {
  name: 'readme.md',
  content: '# Hello Agent',
})
console.log(`  结果: ${r1.success ? '✅' : '❌'} ${r1.message || r1.error}`)

// --- 演示 2: 被 Hook 拦截 ---
console.log('\n▶ 演示 2: 尝试删除受保护文件 (podman.json)')
console.log('  预期: FileDeleteGuard 拦截')
const r2 = await core.dispatch('file-manager.delete', { name: 'package.json' })
console.log(`  结果: ${r2.success ? '✅' : '❌'} ${r2.message || r2.error}`)

// --- 演示 3: 非法文件名 ---
console.log('\n▶ 演示 3: 创建非法文件名')
console.log('  预期: FileNameValidator 拦截')
const r3 = await core.dispatch('file-manager.create', {
  name: 'test?:file.txt',
  content: 'bad name',
})
console.log(`  结果: ${r3.success ? '✅' : '❌'} ${r3.message || r3.error}`)

// --- 演示 4: 成功删除普通文件（Hook 不拦截） ---
console.log('\n▶ 演示 4: 删除普通文件（先创建再删除）')
console.log('  预期: pre-hooks 通过，action 执行，NotificationHook 触发')
await core.dispatch('file-manager.create', {
  name: 'temp.txt',
  content: '临时文件',
})
const r4 = await core.dispatch('file-manager.delete', { name: 'temp.txt' })
console.log(`  结果: ${r4.success ? '✅' : '❌'} ${r4.message || r4.error}`)

// --- 演示 5: Git 操作 ---
console.log('\n▶ 演示 5: Git 初始化并提交')
console.log('  预期: 正常执行（无文件相关 Hook 匹配）')
await core.dispatch('git-helper.init', { name: 'my-project' })
const r5 = await core.dispatch('git-helper.commit', {
  repo: 'my-project',
  message: 'feat: 初始化项目结构',
})
console.log(`  结果: ${r5.success ? '✅' : '❌'} ${JSON.stringify(r5.data)}`)

// --- 演示 6: 插件 Skill ---
console.log('\n▶ 演示 6: 使用插件提供的 Skill')
console.log('  预期: 插件自带 Hooks 审计')
const r6a = await core.dispatch('counter.increment', { step: 5 })
const r6b = await core.dispatch('counter.increment', { step: 3 })
const r6c = await core.dispatch('counter.get', {})
console.log(`  结果: 计数器 = ${(r6c.data as any).value}`)

// --- 演示 7: 子智能体并行 ---
console.log('\n▶ 演示 7: 子智能体并行执行')
console.log('  预期: 两个 Worker 并行处理')
const results = await core.subAgents.executeAll([
  { id: 'task-1', type: 'analyze', params: {} },
  { id: 'task-2', type: 'file-scan', params: {} },
])
results.forEach((r) => {
  console.log(`  ${r.taskId}: ${r.success ? '✅' : '❌'} ${JSON.stringify(r.data)}`)
})

// --- 演示 8: 卸载插件 ---
console.log('\n▶ 演示 8: 卸载插件')
await core.uninstallPlugin('audit-plugin')
console.log(`  插件数: ${core.plugins.count()}`)

// ==================== 审计摘要 ====================

console.log('\n' + '═'.repeat(50))
console.log('  📊 审计摘要')
console.log('═'.repeat(50))

const auditLog = core.getAuditLog()
console.log(`\n  总操作数: ${auditLog.length}`)
const hStats = core.hooks.getStats()
console.log(`  Hook 配置: 共 ${hStats.total} 个 (pre:${hStats.pre}, post:${hStats.post})`)

// 打印审计日志表
console.log('\n  ┌─────────────────────┬──────────────────────────────┬─────────┐')
console.log('  │ 时间                │ 操作                         │ 结果    │')
console.log('  ├─────────────────────┼──────────────────────────────┼─────────┤')
for (const entry of auditLog) {
  const time = entry.timestamp.substring(11, 19)
  const op = entry.actionPath.padEnd(28)
  const status = entry.result.success ? '✅' : '❌'
  const err = entry.result.error ? ` (${entry.result.error!.substring(0, 15)})` : ''
  console.log(`  │ ${time}              │ ${op} │ ${status}${err.padEnd(6)} │`)
}
console.log('  └─────────────────────┴──────────────────────────────┴─────────┘')

console.log(core.status())
console.log('🎉 5 层 Agent 架构演示完成！')
