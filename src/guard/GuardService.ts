// ============================================================
// GuardService — 凌霄安全护栏核心引擎
// 对外暴露统一的检查入口，供 POST /api/guard/check 调用
// ============================================================

// ── 检测结果 ──────────────────────────────────────────────────
export interface GuardCheckResult {
  allowed: boolean
  reason?: string
  detections: { rule: string; severity: 'critical' | 'high' | 'medium' | 'low'; detail: string }[]
  durationMs: number
}

export interface GuardRule {
  name: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  enabled: boolean
  category: 'secret' | 'injection' | 'pii' | 'path' | 'content'
  check: (input: string, context?: any) => string | null // null = 通过, string = 检测到的内容
}

// ── 规则管理 ──────────────────────────────────────────────────
export class GuardService {
  private rules: GuardRule[] = []
  private auditCallback: ((result: GuardCheckResult, input: string) => void) | null = null

  constructor() {
    this.registerDefaults()
  }

  onAudit(cb: (result: GuardCheckResult, input: string) => void): void {
    this.auditCallback = cb
  }

  registerRule(rule: GuardRule): void {
    this.rules.push(rule)
  }

  getRules(): GuardRule[] {
    return this.rules.map(r => ({
      name: r.name,
      description: r.description,
      severity: r.severity,
      enabled: r.enabled,
      category: r.category,
    } as any))
  }

  setRuleEnabled(name: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.name === name)
    if (!rule) return false
    rule.enabled = enabled
    return true
  }

  // ── 核心入口 ──────────────────────────────────────────────

  check(input: string, context?: any): GuardCheckResult {
    const t0 = Date.now()
    const detections: GuardCheckResult['detections'] = []

    for (const rule of this.rules) {
      if (!rule.enabled) continue
      const result = rule.check(input, context)
      if (result !== null) {
        detections.push({
          rule: rule.name,
          severity: rule.severity,
          detail: result,
        })
      }
    }

    const ms = Date.now() - t0
    const blocked = detections.length > 0
    const result: GuardCheckResult = {
      allowed: !blocked,
      reason: blocked ? `检测到 ${detections.length} 项安全问题` : undefined,
      detections,
      durationMs: ms,
    }

    // 审计回调
    if (this.auditCallback) {
      this.auditCallback(result, input)
    }

    return result
  }

  // ── 默认规则 ──────────────────────────────────────────────

  private registerDefaults(): void {
    // ===== Secret 检测 =====
    this.registerRule({
      name: 'OpenAI API Key',
      description: '检测 OpenAI 格式的 API Key',
      severity: 'critical', enabled: true, category: 'secret',
      check: (s) => /sk-[a-zA-Z0-9]{32,}/.test(s) ? '发现 OpenAI API Key (sk-*)' : null,
    })
    this.registerRule({
      name: 'AWS Access Key',
      description: '检测 AWS Access Key ID',
      severity: 'critical', enabled: true, category: 'secret',
      check: (s) => /AKIA[0-9A-Z]{16}/.test(s) ? '发现 AWS Access Key (AKIA*)' : null,
    })
    this.registerRule({
      name: 'GitHub Token',
      description: '检测 GitHub Personal Access Token',
      severity: 'high', enabled: true, category: 'secret',
      check: (s) => /ghp_[a-zA-Z0-9]{36}/.test(s) ? '发现 GitHub Token (ghp_*)' : null,
    })
    this.registerRule({
      name: 'JWT Token',
      description: '检测 JWT 格式 Token',
      severity: 'high', enabled: true, category: 'secret',
      check: (s) => /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(s) ? '发现 JWT Token' : null,
    })
    this.registerRule({
      name: 'Private Key',
      description: '检测 PEM 私钥',
      severity: 'critical', enabled: true, category: 'secret',
      check: (s) => /-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(s) ? '发现私钥 (PEM)' : null,
    })
    this.registerRule({
      name: 'Plaintext Password',
      description: '检测明文密码',
      severity: 'high', enabled: true, category: 'secret',
      check: (s) => /password['"]?\s*[:=]\s*['"][^'"]{3,}['"]/i.test(s) ? '发现明文密码' : null,
    })
    this.registerRule({
      name: 'Slack Webhook',
      description: '检测 Slack Webhook URL',
      severity: 'medium', enabled: true, category: 'secret',
      check: (s) => /hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+/.test(s) ? '发现 Slack Webhook' : null,
    })

    // ===== PII 检测（新增）=====
    this.registerRule({
      name: 'Chinese Phone Number',
      description: '检测中国大陆手机号',
      severity: 'high', enabled: true, category: 'pii',
      check: (s) => {
        const m = s.match(/1[3-9]\d{9}/g)
        return m ? `发现 ${m.length} 个手机号` : null
      },
    })
    this.registerRule({
      name: 'Chinese ID Card',
      description: '检测中国大陆身份证号（18位）',
      severity: 'critical', enabled: true, category: 'pii',
      check: (s) => {
        const m = s.match(/\b[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g)
        return m ? `发现 ${m.length} 个身份证号` : null
      },
    })
    this.registerRule({
      name: 'Bank Card Number',
      description: '检测银行卡号（16-19位）',
      severity: 'critical', enabled: true, category: 'pii',
      check: (s) => {
        const m = s.match(/\b\d{16,19}\b/g)
        if (!m) return null
        // 滤掉太像普通数字的（全零、全一、简单递增）
        const valid = m.filter(n => !/^(\d)\1+$/.test(n) && !/^123456/.test(n) && parseInt(n[0]) >= 3)
        return valid.length > 0 ? `发现 ${valid.length} 个银行卡号` : null
      },
    })
    this.registerRule({
      name: 'Email Address',
      description: '检测电子邮件地址',
      severity: 'low', enabled: true, category: 'pii',
      check: (s) => {
        const m = s.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
        return m ? `发现 ${m.length} 个邮箱地址` : null
      },
    })

    // ===== SQL 注入 =====
    this.registerRule({
      name: 'SQL Injection',
      description: '检测 SQL 注入攻击特征',
      severity: 'critical', enabled: true, category: 'injection',
      check: (s) => {
        const patterns = [
          /(\bSELECT\b.*\bFROM\b|\bINSERT\b.*\bINTO\b|\bDELETE\b.*\bFROM\b|\bDROP\b.*\bTABLE\b|\bALTER\b.*\bTABLE\b)/is,
          /\bUNION\b.*\bSELECT\b/is,
          /'(\s*OR\s+1\s*=\s*1\s*)/is,
          /';?\s*--\s*$/im,
          /\bEXEC\b.*\bxp_cmdshell\b/is,
        ]
        for (const p of patterns) {
          if (p.test(s)) return '检测到 SQL 注入特征'
        }
        return null
      },
    })

    // ===== XSS =====
    this.registerRule({
      name: 'XSS Attack',
      description: '检测跨站脚本攻击特征',
      severity: 'critical', enabled: true, category: 'injection',
      check: (s) => {
        const patterns = [
          /<\s*script[^>]*>/is, /<\s*iframe[^>]*>/is, /javascript\s*:/is,
          /on\w+\s*=\s*["']/is, /<img[^>]+onerror\s*=/is, /eval\s*\(/is,
          /document\.cookie/is,
        ]
        for (const p of patterns) {
          if (p.test(s)) return '检测到 XSS 特征'
        }
        return null
      },
    })

    // ===== 路径遍历 =====
    this.registerRule({
      name: 'Path Traversal',
      description: '检测路径遍历攻击',
      severity: 'high', enabled: true, category: 'path',
      check: (s) => {
        const patterns = [/\.\.\//, /etc\/passwd/i, /etc\/shadow/i, /\/root\//, /%2e%2e%2f/i]
        for (const p of patterns) {
          if (p.test(s)) return '检测到路径遍历特征'
        }
        return null
      },
    })

    // ===== 敏感内容 =====
    this.registerRule({
      name: 'Toxic Content',
      description: '检测极端恶意内容',
      severity: 'high', enabled: true, category: 'content',
      check: (s) => {
        const patterns = [/如何制作炸弹/i, /如何制作毒品/i, /如何自杀/i]
        for (const p of patterns) {
          if (p.test(s)) return `检测到敏感内容: ${s.match(p)?.[0] || ''}`
        }
        return null
      },
    })
  }
}
