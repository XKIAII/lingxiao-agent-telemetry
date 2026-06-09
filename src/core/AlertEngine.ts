// ============================================================
// Phase 2: AlertEngine — 告警引擎
// 检查拦截率，触发 webhook 通知
// ============================================================

interface AlertConfig {
  threshold: number       // 拦截率阈值 (0-100)
  cooldownMs: number      // 冷静期，避免重复告警
  webhookUrl?: string     // 通知 webhook URL
}

interface AlertState {
  lastCheck: number
  alerted: boolean
  acknowledged: boolean
  message: string
}

export class AlertEngine {
  private config: AlertConfig
  private state: AlertState = {
    lastCheck: 0, alerted: false, acknowledged: false, message: '',
  }

  constructor(config?: Partial<AlertConfig>) {
    this.config = {
      threshold: config?.threshold ?? 30,
      cooldownMs: config?.cooldownMs ?? 60000,
      webhookUrl: config?.webhookUrl || process.env.ALERT_WEBHOOK_URL,
    }
  }

  check(totalOps: number, blockedOps: number, recentBlocks?: { hook: string; action: string; reason: string }[]): {
    alerting: boolean; message: string; newAlert: boolean
  } {
    if (totalOps === 0) return { alerting: false, message: '', newAlert: false }

    const rate = (blockedOps / totalOps) * 100
    const now = Date.now()

    if (rate >= this.config.threshold) {
      const msg = `拦截率 ${rate.toFixed(1)}%（阈值 ${this.config.threshold}%）, 总操作 ${totalOps}, 拦截 ${blockedOps}`

      if (!this.state.alerted || (now - this.state.lastCheck > this.config.cooldownMs)) {
        this.state.alerted = true
        this.state.acknowledged = false
        this.state.message = msg
        this.state.lastCheck = now

        this.sendWebhook('ALERT', msg, recentBlocks)
        return { alerting: true, message: msg, newAlert: true }
      }

      return { alerting: true, message: msg, newAlert: false }
    }

    // 恢复正常
    if (this.state.alerted) {
      this.sendWebhook('RECOVER', `拦截率已恢复正常: ${rate.toFixed(1)}%`)
      this.state.alerted = false
      this.state.acknowledged = false
      this.state.message = ''
    }

    this.state.lastCheck = now
    return { alerting: false, message: '', newAlert: false }
  }

  acknowledge(): void {
    this.state.acknowledged = true
  }

  getState(): { alerted: boolean; acknowledged: boolean; message: string; threshold: number } {
    return {
      alerted: this.state.alerted,
      acknowledged: this.state.acknowledged,
      message: this.state.message,
      threshold: this.config.threshold,
    }
  }

  private async sendWebhook(type: string, msg: string, blocks?: any[]): Promise<void> {
    const url = this.config.webhookUrl
    if (!url) return

    const payload = {
      type,
      agent_telemetry: true,
      timestamp: new Date().toISOString(),
      message: msg,
      blocks: blocks?.slice(0, 5) || [],
    }

    try {
      // Use fetch API (available in Node 22)
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {})
    } catch { /* webhook is best-effort */ }

    console.log(`[AlertEngine] 🔔 ${type}: ${msg}`)
  }
}
