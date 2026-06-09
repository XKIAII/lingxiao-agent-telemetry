#!/usr/bin/env node
// agent-ctl — Agent 可观测平台 CLI 工具
// 用法: node bin/agent-ctl.mjs start|stop|logs|hooks|token

import { execSync, spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname || '.', '..')
const API = 'http://localhost:3000/api'
const TOKEN = process.env.AGENT_TELEMETRY_TOKEN || ''

function curl(path) {
  const args = ['-s', `${API}${path}`]
  if (TOKEN) args.push('-H', `Authorization: Bearer ${TOKEN}`)
  return execSync('curl', args, { encoding: 'utf-8', stdio: 'pipe' })
}

function curlPost(path, data) {
  const args = ['-s', '-X', 'POST', `${API}${path}`, '-H', 'Content-Type: application/json', '-d', JSON.stringify(data)]
  if (TOKEN) args.push('-H', `Authorization: Bearer ${TOKEN}`)
  return execSync('curl', args, { encoding: 'utf-8', stdio: 'pipe' })
}

const cmd = process.argv[2]

switch (cmd) {
  case 'start':
    console.log('启动 Agent 可观测服务...')
    spawn('npx', ['tsx', 'src/demo-server.ts'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env } })
    break

  case 'stop':
    try { execSync('pkill -f "demo-server"', { encoding: 'utf-8' }); console.log('已停止') }
    catch { console.log('服务未运行') }
    break

  case 'status':
  case 'stats':
    try { console.log(curl('/stats')) } catch { console.log('服务未响应') }
    break

  case 'logs':
    try { console.log(curl('/audit/recent?limit=10')) } catch { console.log('服务未响应') }
    break

  case 'hooks':
    try { console.log(curl('/hooks-config')) } catch { console.log('服务未响应') }
    break

  case 'hook-on':
    try { console.log(curlPost('/hooks-config', { hooks: { [process.argv[3]]: { enabled: true } } })) }
    catch { console.log('操作失败，请确认 Hook 名称正确') }
    break

  case 'hook-off':
    try { console.log(curlPost('/hooks-config', { hooks: { [process.argv[3]]: { enabled: false } } })) }
    catch { console.log('操作失败，请确认 Hook 名称正确') }
    break

  case 'token':
    console.log(TOKEN || '(未设置 — 认证已禁用)')
    break

  default:
    console.log(`
Agent 可观测平台 CLI — agent-ctl

  node bin/agent-ctl.mjs start          启动服务
  node bin/agent-ctl.mjs stop           停止服务
  node bin/agent-ctl.mjs status         查看运行状态和统计
  node bin/agent-ctl.mjs logs           查看最近 10 条审计日志
  node bin/agent-ctl.mjs hooks          查看 Hook 规则配置
  node bin/agent-ctl.mjs hook-on <name> 启用某个 Hook
  node bin/agent-ctl.mjs hook-off <name> 禁用某个 Hook
  node bin/agent-ctl.mjs token          查看当前认证 Token

  环境变量:
    AGENT_TELEMETRY_TOKEN  设置认证 Token（留空则禁用认证）
`)
}
