// ============================================================
// P1 Hook: 敏感信息检测 — SecretDetector
// 检测 Agent 操作参数中的 API Key、私钥、密码等敏感信息
// ============================================================

import type { HookDefinition, HookContext, HookResult } from '../types'

interface DetectionRule {
  name: string
  pattern: RegExp
  severity: 'critical' | 'high' | 'medium'
}

const RULES: DetectionRule[] = [
  { name: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{32,}/, severity: 'critical' },
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/, severity: 'critical' },
  { name: 'AWS Secret Key', pattern: /[a-zA-Z0-9/+]{40}/, severity: 'critical' },
  { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/, severity: 'high' },
  { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, severity: 'high' },
  { name: 'Private Key (PEM)', pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, severity: 'critical' },
  { name: 'Password in plaintext', pattern: /password['"]?\s*[:=]\s*['"][^'"]{3,}['"]/i, severity: 'high' },
  { name: 'API Key (generic)', pattern: /api[_-]?key['"]?\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i, severity: 'medium' },
  { name: 'Slack Webhook', pattern: /hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+/, severity: 'medium' },
]

export const SecretDetector: HookDefinition = {
  name: 'SecretDetector',
  type: 'pre',
  priority: 3, // 在 FileDeleteGuard(p1) 之后，GlobalAuthGuard(p5) 之前
  enabled: true,
  match: { skill: '*', action: '*' },

  handler: async (ctx: HookContext): Promise<HookResult> => {
    const paramsStr = JSON.stringify(ctx.params)
    const detected: string[] = []

    for (const rule of RULES) {
      if (rule.pattern.test(paramsStr)) {
        detected.push(rule.name)
      }
    }

    if (detected.length > 0) {
      return {
        allowed: false,
        reason: `检测到敏感信息: ${detected.join(', ')}。请勿在操作参数中硬编码密钥或密码。`,
      }
    }

    return { allowed: true }
  },
}

// 同时导出匹配规则，供 Dashboard 显示
export const secretRules = RULES.map(r => ({ name: r.name, severity: r.severity }))
