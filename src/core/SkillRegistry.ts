// ============================================================
// 第 2 层：知识层 — SkillRegistry
// 注册、发现、解析 Skill
// ============================================================

import type { Skill, SkillManifest } from '../types'

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map()

  register(skill: Skill): void {
    if (this.skills.has(skill.name)) {
      console.warn(`[SkillRegistry] Skill "${skill.name}" 已存在，将被覆盖`)
    }
    this.skills.set(skill.name, skill)
    console.log(`[SkillRegistry] ✅ 注册 Skill: ${skill.name}@${skill.version}`)
  }

  unregister(name: string): void {
    if (this.skills.delete(name)) {
      console.log(`[SkillRegistry] 🗑 移除 Skill: ${name}`)
    }
  }

  resolve(actionPath: string): { skill: Skill; skillName: string; actionName: string } | null {
    const dotIndex = actionPath.lastIndexOf('.')
    if (dotIndex === -1) return null

    const skillName = actionPath.substring(0, dotIndex)
    const actionName = actionPath.substring(dotIndex + 1)
    const skill = this.skills.get(skillName)

    if (!skill) return null
    if (!skill.actions[actionName]) return null

    return { skill, skillName, actionName }
  }

  findByTrigger(keyword: string): Skill[] {
    const lower = keyword.toLowerCase()
    return Array.from(this.skills.values()).filter((s) =>
      s.triggers.some((t) => t.toLowerCase().includes(lower))
    )
  }

  getManifests(): SkillManifest[] {
    return Array.from(this.skills.values()).map((s) => ({
      name: s.name,
      version: s.version,
      description: s.description,
      triggers: s.triggers,
      actions: Object.keys(s.actions),
    }))
  }

  size(): number {
    return this.skills.size
  }
}
