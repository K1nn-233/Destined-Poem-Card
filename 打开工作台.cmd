@echo off
chcp 65001 >nul
title 命定之诗工作台
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node tools\workbench\launch.mjs %*
if errorlevel 1 pause
exit /b

:nonode
echo.
echo   没有找到 Node.js，工作台需要先安装它。
echo   请安装 Node.js 24 或更新的 LTS 版本，装好后重新双击本文件。
echo   正在为你打开下载页面……
echo.
start "" "https://nodejs.org/zh-cn/download"
pause
exit /b 1
