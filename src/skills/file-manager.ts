// ============================================================
// 示例 Skill：文件管理器
// 演示知识层的 Skill 定义和 action handler
// ============================================================

import type { Skill, ActionParams, ActionContext, ActionResult } from '../types'

const fileStore = new Map<string, string>()

async function createFile(
  params: ActionParams,
  _ctx: ActionContext
): Promise<ActionResult> {
  const name = params.name as string
  const content = (params.content as string) || ''

  if (!name) {
    return { success: false, error: '缺少必填字段: name', code: 'VALIDATION_ERROR' }
  }

  fileStore.set(name, content)
  console.log(`  📄 创建文件: ${name}`)
  return { success: true, data: { name, size: content.length }, message: `文件 ${name} 创建成功` }
}

async function readFile(
  params: ActionParams,
  _ctx: ActionContext
): Promise<ActionResult> {
  const name = params.name as string
  if (!name) {
    return { success: false, error: '缺少必填字段: name', code: 'VALIDATION_ERROR' }
  }

  const content = fileStore.get(name)
  if (content === undefined) {
    return { success: false, error: `文件 ${name} 不存在`, code: 'NOT_FOUND' }
  }

  return { success: true, data: { name, content } }
}

async function deleteFile(
  params: ActionParams,
  _ctx: ActionContext
): Promise<ActionResult> {
  const name = params.name as string
  if (!name) {
    return { success: false, error: '缺少必填字段: name', code: 'VALIDATION_ERROR' }
  }

  if (!fileStore.has(name)) {
    return { success: false, error: `文件 ${name} 不存在`, code: 'NOT_FOUND' }
  }

  fileStore.delete(name)
  console.log(`  🗑 删除文件: ${name}`)
  return { success: true, message: `文件 ${name} 已删除` }
}

export const FileManagerSkill: Skill = {
  name: 'file-manager',
  version: '1.0.0',
  description: '文件管理 — 创建、读取、删除文件',
  triggers: ['文件', '创建文件', '读取文件', '删除文件'],
  actions: {
    create: { name: 'create', description: '创建新文件', handler: createFile },
    read: { name: 'read', description: '读取文件内容', handler: readFile },
    delete: { name: 'delete', description: '删除文件', handler: deleteFile },
  },
}
