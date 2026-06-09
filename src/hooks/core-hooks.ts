// ============================================================
// 第 3 层：护栏层 — 默认 Hook 规则集
// 这是从 agent-hooks Skill 映射过来的确定性规则
// ============================================================

import type { HookDefinition, HookContext, HookResult } from '../types'

// ===== P0 阻断级 =====

/** 文件操作禁区：禁止 delete 操作 */
export const FileDeleteGuard: HookDefinition = {
  name: 'FileDeleteGuard',
  type: 'pre',
  match: { skill: 'file-manager', action: 'delete' },
  priority: 1,
  enabled: true,
  handler: async (ctx: HookContext): Promise<HookResult> => {
    const filename = ctx.params.name as string
    if (!filename) {
      return { allowed: false, reason: '文件名不能为空' }
    }

    // 禁止删除系统文件
    const protectedFiles = ['config.json', '.env', 'package.json', 'tsconfig.json']
    if (protectedFiles.includes(filename)) {
      return {
        allowed: false,
        reason: `⛔ 禁止删除受保护的文件: ${filename}`,
      }
    }

    return { allowed: true }
  },
}

// ===== P1 警告级 =====

/** 文件命名校验 */
export const FileNameValidator: HookDefinition = {
  name: 'FileNameValidator',
  type: 'pre',
  match: { skill: 'file-manager', action: 'create' },
  priority: 10,
  enabled: true,
  handler: async (ctx: HookContext): Promise<HookResult> => {
    const filename = ctx.params.name as string

    // 禁止特殊字符
    if (filename && /[<>:"|?*]/.test(filename)) {
      return {
        allowed: false,
        reason: `⛔ 文件名包含非法字符: ${filename}`,
      }
    }

    // 长度限制
    if (filename && filename.length > 255) {
      return {
        allowed: false,
        reason: `⛔ 文件名过长 (${filename.length} > 255)`,
      }
    }

    return { allowed: true }
  },
}

/** 通用权限校验：匹配所有 Skill */
export const GlobalAuthGuard: HookDefinition = {
  name: 'GlobalAuthGuard',
  type: 'pre',
  match: { skill: '*', action: '*' },
  priority: 5,
  enabled: true,
  handler: async (ctx: HookContext): Promise<HookResult> => {
    // 这里是示例：要求 dispatch 前必须 setUser
    // 实际场景中这里是 JWT 验证或 RBAC 检查
    if (!ctx.user) {
      console.log('  [GlobalAuthGuard] ⚠ 未设置用户，以匿名身份继续')
      // 宽松策略：匿名允许，实际可改为拦截
    }
    return { allowed: true }
  },
}

// ===== P2 审计级 =====

/** 审计日志 */
export const AuditTrailHook: HookDefinition = {
  name: 'AuditTrail',
  type: 'post',
  match: { skill: '*', action: '*' },
  priority: 100,
  enabled: true,
  handler: async (ctx: HookContext): Promise<HookResult> => {
    const user = ctx.user?.username || 'anonymous'
    const success = ctx.actionResult?.success ? '✅' : '❌'
    console.log(
      `  [Audit] ${success} ${user} → ${ctx.skill}.${ctx.action} (${ctx.durationMs}ms)`
    )
    return { allowed: true }
  },
}

/** 副作用通知 */
export const NotificationHook: HookDefinition = {
  name: 'NotificationHook',
  type: 'post',
  match: { skill: 'file-manager', action: 'delete' },
  priority: 200,
  enabled: true,
  handler: async (ctx: HookContext): Promise<HookResult> => {
    if (ctx.actionResult?.success) {
      console.log(`  📢 通知: 文件 ${ctx.params.name} 已被 ${ctx.user?.username || 'anonymous'} 删除`)
    }
    return { allowed: true }
  },
}

// ===== 默认规则集（批量注册用） =====
export const CoreHooks: HookDefinition[] = [
  FileDeleteGuard,
  FileNameValidator,
  GlobalAuthGuard,
  AuditTrailHook,
  NotificationHook,
]
