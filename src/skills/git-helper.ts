// ============================================================
// 示例 Skill：Git 助手
// 演示另一个独立的知识领域
// ============================================================

import type { Skill, ActionParams, ActionContext, ActionResult } from '../types'

const repoStore = new Map<string, { commits: string[]; branch: string }>()

async function initRepo(
  params: ActionParams,
  _ctx: ActionContext
): Promise<ActionResult> {
  const name = params.name as string
  if (!name) {
    return { success: false, error: '仓库名不能为空', code: 'VALIDATION_ERROR' }
  }

  if (repoStore.has(name)) {
    return { success: false, error: `仓库 ${name} 已存在`, code: 'CONFLICT' }
  }

  repoStore.set(name, { commits: [], branch: 'main' })
  console.log(`  🔧 初始化 Git 仓库: ${name}`)
  return { success: true, data: { name, branch: 'main' } }
}

async function commit(
  params: ActionParams,
  _ctx: ActionContext
): Promise<ActionResult> {
  const repo = params.repo as string
  const message = params.message as string

  const data = repoStore.get(repo)
  if (!data) {
    return { success: false, error: `仓库 ${repo} 不存在`, code: 'NOT_FOUND' }
  }

  if (!message) {
    return { success: false, error: '提交信息不能为空', code: 'VALIDATION_ERROR' }
  }

  data.commits.push(message)
  console.log(`  📝 Git 提交: ${message}`)
  return {
    success: true,
    data: { repo, commit: message, branch: data.branch, totalCommits: data.commits.length },
  }
}

async function status(
  params: ActionParams,
  _ctx: ActionContext
): Promise<ActionResult> {
  const repo = params.repo as string
  const data = repoStore.get(repo)
  if (!data) {
    return { success: false, error: `仓库 ${repo} 不存在`, code: 'NOT_FOUND' }
  }

  return {
    success: true,
    data: {
      repo,
      branch: data.branch,
      commits: data.commits.length,
      latestCommit: data.commits[data.commits.length - 1] || null,
    },
  }
}

export const GitHelperSkill: Skill = {
  name: 'git-helper',
  version: '1.0.0',
  description: 'Git 操作 — 初始化、提交、查看状态',
  triggers: ['git', '初始化仓库', '提交', '仓库状态'],
  actions: {
    init: { name: 'init', description: '初始化仓库', handler: initRepo },
    commit: { name: 'commit', description: '提交更改', handler: commit },
    status: { name: 'status', description: '查看仓库状态', handler: status },
  },
}
