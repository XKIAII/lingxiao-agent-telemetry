// ============================================================
// 第 1 层：记忆层 — RuleEngine
// 状态流转规则 + 业务校验规则
// ============================================================

import type { StatusTransitionRule, BusinessRule, RuleValidationResult } from '../types'

export class RuleEngine {
  private statusRules: StatusTransitionRule[] = []
  private businessRules: BusinessRule[] = []

  // --- 状态流转规则 ---
  addStatusRule(rule: StatusTransitionRule): void {
    this.statusRules.push(rule)
  }

  validateTransition(
    entity: string,
    fromStatus: string,
    toStatus: string,
    role?: string
  ): RuleValidationResult {
    const rule = this.statusRules.find(
      (r) => r.entity === entity && r.fromStatus === fromStatus
    )

    if (!rule) {
      return { valid: false, message: `未找到实体 ${entity} 的状态 ${fromStatus} 的流转规则` }
    }

    if (!rule.toStatuses.includes(toStatus)) {
      return {
        valid: false,
        message: `${entity} 不允许从 ${fromStatus} → ${toStatus}`,
        errors: [`可用目标: ${rule.toStatuses.join(', ')}`],
      }
    }

    if (rule.roles && role && !rule.roles.includes(role)) {
      return {
        valid: false,
        message: `角色 ${role} 无权执行此状态流转`,
      }
    }

    return { valid: true, message: `${entity} ${fromStatus} → ${toStatus} 校验通过` }
  }

  // --- 业务规则 ---
  addBusinessRule(rule: BusinessRule): void {
    this.businessRules.push(rule)
  }

  validateBusiness(params: Record<string, unknown>, skillName?: string): RuleValidationResult {
    for (const rule of this.businessRules) {
      // 如果规则限定了 skill 范围，检查当前 skill 是否匹配
      if (rule.skills && rule.skills.length > 0 && skillName && !rule.skills.includes(skillName)) {
        continue
      }
      const result = rule.validate(params)
      if (!result.valid) return result
    }
    return { valid: true, message: '所有业务规则校验通过' }
  }

  getRules(): { statusRules: number; businessRules: number } {
    return {
      statusRules: this.statusRules.length,
      businessRules: this.businessRules.length,
    }
  }
}
