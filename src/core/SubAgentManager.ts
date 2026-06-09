// ============================================================
// 第 4 层：委派层 — SubAgentManager
// 子智能体管理，支持并行任务分发
// ============================================================

import type { AgentConfig, SubAgentTask, SubAgentResult, SubAgentWorker } from '../types'

export class SubAgentManager {
  private workers: Map<string, SubAgentWorker> = new Map()
  private config: Readonly<AgentConfig>

  constructor(config: Readonly<AgentConfig>) {
    this.config = config
  }

  registerWorker(worker: SubAgentWorker): void {
    this.workers.set(worker.name, worker)
    console.log(
      `[SubAgentManager] 🤖 注册 Worker: ${worker.name} (${worker.capabilities.join(', ')})`
    )
  }

  /**
   * 执行单个任务
   */
  async execute(task: SubAgentTask): Promise<SubAgentResult> {
    const worker = this.findWorker(task.type)
    if (!worker) {
      return {
        taskId: task.id,
        success: false,
        error: `未找到处理 ${task.type} 的 Worker`,
      }
    }

    console.log(
      `[SubAgentManager] 🚀 委派任务 ${task.id} → Worker "${worker.name}"`
    )

    const timeout = new Promise<SubAgentResult>((_, reject) =>
      setTimeout(
        () => reject(new Error('任务超时')),
        this.config.subAgentTimeoutMs
      )
    )

    try {
      return await Promise.race([worker.execute(task), timeout])
    } catch (err: any) {
      return { taskId: task.id, success: false, error: err.message }
    }
  }

  /**
   * 并行执行多个任务
   */
  async executeAll(tasks: SubAgentTask[]): Promise<SubAgentResult[]> {
    if (tasks.length > this.config.maxSubAgents) {
      console.warn(
        `[SubAgentManager] 任务数 ${tasks.length} 超过最大限制 ${this.config.maxSubAgents}`
      )
    }

    console.log(`[SubAgentManager] ⚡ 并行执行 ${tasks.length} 个任务`)
    return Promise.all(tasks.map((t) => this.execute(t)))
  }

  private findWorker(taskType: string): SubAgentWorker | undefined {
    for (const worker of this.workers.values()) {
      if (worker.capabilities.includes(taskType)) {
        return worker
      }
    }
    return undefined
  }

  workerCount(): number {
    return this.workers.size
  }
}
