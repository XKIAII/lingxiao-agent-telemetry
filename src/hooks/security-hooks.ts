// ============================================================
// 安全防护 Hook 组: SQL注入 / XSS / 路径遍历 / 敏感路径
// ============================================================

import type { HookDefinition, HookContext, HookResult } from '../types'

// ========== SQL 注入检测 ==========
const SQLI_PATTERNS = [
  /(\bSELECT\b.*\bFROM\b|\bINSERT\b.*\bINTO\b|\bDELETE\b.*\bFROM\b|\bUPDATE\b.*\bSET\b|\bDROP\b.*\bTABLE\b|\bALTER\b.*\bTABLE\b)/is,
  /\bUNION\b.*\bSELECT\b/is,
  /'(\s*OR\s+1\s*=\s*1\s*)/is,
  /';?\s*--\s*$/im,
  /\bEXEC\b.*\bxp_cmdshell\b/is,
  /'\s*;\s*DROP\b/is,
]

export const SQLInjectionDetector: HookDefinition = {
  name: 'SQLInjectionDetector',
  type: 'pre',
  priority: 2,
  enabled: true,
  match: { skill: '*', action: '*' },

  handler: async (ctx: HookContext): Promise<HookResult> => {
    const str = typeof ctx.params === 'string' ? ctx.params : JSON.stringify(ctx.params)
    for (const p of SQLI_PATTERNS) {
      if (p.test(str)) {
        return { allowed: false, reason: '检测到 SQL 注入攻击特征' }
      }
    }
    return { allowed: true }
  },
}

// ========== XSS 检测 ==========
const XSS_PATTERNS = [
  /<\s*script[^>]*>/is,
  /<\s*iframe[^>]*>/is,
  /javascript\s*:/is,
  /on\w+\s*=\s*["']/is,
  /<img[^>]+onerror\s*=/is,
  /eval\s*\(/is,
  /document\.cookie/is,
  /<svg[^>]+onload\s*=/is,
]

export const XSSDetector: HookDefinition = {
  name: 'XSSDetector',
  type: 'pre',
  priority: 2,
  enabled: true,
  match: { skill: '*', action: '*' },

  handler: async (ctx: HookContext): Promise<HookResult> => {
    const str = typeof ctx.params === 'string' ? ctx.params : JSON.stringify(ctx.params)
    for (const p of XSS_PATTERNS) {
      if (p.test(str)) {
        return { allowed: false, reason: '检测到 XSS 攻击特征' }
      }
    }
    return { allowed: true }
  },
}

// ========== 路径遍历检测 ==========
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\\\.\.\\/,
  /etc\/passwd/i,
  /etc\/shadow/i,
  /C:\\Windows\\System32/i,
  /\/root\//,
  /\bpassword\.txt\b/i,
  /\\\.\.\\/,
  /%2e%2e%2f/i,
  /\\\.\.\\/,
]

export const PathTraversalDetector: HookDefinition = {
  name: 'PathTraversalDetector',
  type: 'pre',
  priority: 2,
  enabled: true,
  match: { skill: '*', action: '*' },

  handler: async (ctx: HookContext): Promise<HookResult> => {
    const str = typeof ctx.params === 'string' ? ctx.params : JSON.stringify(ctx.params)
    for (const p of PATH_TRAVERSAL_PATTERNS) {
      if (p.test(str)) {
        return { allowed: false, reason: '检测到路径遍历/敏感路径访问' }
      }
    }
    return { allowed: true }
  },
}
