#!/bin/bash
# ============================================================
# 凌霄 Agent 可观测平台 — 一键演示脚本
# 运行: bash demo.sh
# ============================================================

set -e

echo ""
echo "========================================"
echo "  凌霄 Agent 可观测平台 — 演示"
echo "========================================"
echo ""

# 1. 安装依赖
echo "[1/5] 安装依赖..."
npm install --silent 2>/dev/null || npm install

# 2. 清理旧数据
echo "[2/5] 清理旧数据..."
rm -f data/agent-audit.db* 2>/dev/null || true

# 3. 启动服务(后台)
echo "[3/5] 启动服务..."
npx tsx src/demo-server.ts &
SERVER_PID=$!
sleep 6

# 4. 运行演示
echo "[4/5] 运行安全红队 + LangChain..."
echo ""
cd python-sdk
python red_team.py 2>/dev/null || python3 red_team.py 2>/dev/null || C:/Users/Administrator/.workbuddy/binaries/python/versions/3.13.12/python.exe red_team.py
echo ""
python langchain_demo.py 2>/dev/null || python3 langchain_demo.py 2>/dev/null || C:/Users/Administrator/.workbuddy/binaries/python/versions/3.13.12/python.exe langchain_demo.py
cd ..

# 5. 打开 Dashboard
echo ""
echo "[5/5] Dashboard 在线"
echo ""
echo "========================================"
echo "  http://localhost:3000/dashboard.html"
echo "  http://localhost:3000/dashboard.html?agent=red-team"
echo "  http://localhost:3000/dashboard.html?agent=langchain-agent"
echo ""
echo "  按 Ctrl+C 停止服务"
echo "========================================"

wait $SERVER_PID
