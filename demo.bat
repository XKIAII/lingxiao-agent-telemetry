@echo off
REM ============================================================
REM 凌霄 Agent 可观测平台 — 一键演示脚本 (Windows)
REM 双击运行或: demo.bat
REM ============================================================

echo.
echo ========================================
echo   凌霄 Agent 可观测平台 — 演示
echo ========================================
echo.

echo [1/5] 安装依赖...
call npm install --silent 2>nul

echo [2/5] 清理旧数据...
del /Q data\agent-audit.db* 2>nul

echo [3/5] 启动服务...
start /B npx tsx src/demo-server.ts > nul 2>&1
timeout /t 6 /nobreak > nul

echo [4/5] 运行演示...
echo.
cd python-sdk
python red_team.py 2>nul || python3 red_team.py 2>nul
echo.
python langchain_demo.py 2>nul || python3 langchain_demo.py 2>nul
cd ..

echo.
echo [5/5] Dashboard 在线
echo.
echo ========================================
echo   http://localhost:3000/dashboard.html
echo ========================================
echo.
echo   按 Ctrl+C 停止服务
echo.

REM 打开浏览器
start http://localhost:3000/dashboard.html

pause
