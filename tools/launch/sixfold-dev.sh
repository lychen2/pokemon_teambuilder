#!/usr/bin/env bash
# 开发者模式：Vite 开发服务器（127.0.0.1:5184）+ Electron，renderer 热更新、main/preload 由 esbuild watch 增量重编。
# - 已在运行时只聚焦窗口，不重复启动（Vite 端口 5184 是 strictPort，重复启动会失败）；
# - 日志追加到 ${XDG_STATE_HOME:-~/.local/state}/sixfold/dev.log，用 tail -f 跟；
# - 导出 POKE_DEBUG_PORT（默认 9222，仅监听 127.0.0.1），便于用调试器附加渲染进程。
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_ID="sixfold"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/sixfold"
LOG="$STATE_DIR/dev.log"
mkdir -p "$STATE_DIR"
# shellcheck source=tools/launch/lib.sh
. "$APP_DIR/tools/launch/lib.sh"

export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export POKE_DEBUG_PORT="${POKE_DEBUG_PORT:-9222}"

if pgrep -f "tools/dev[.]mjs" >/dev/null 2>&1; then
  poke_focus_existing_window "$APP_ID" && exit 0
  exit 0
fi

cd "$APP_DIR"
printf '\n=== %s 开发者模式启动（Vite 127.0.0.1:5184 / CDP %s）===\n' "$(date -Is)" "$POKE_DEBUG_PORT" >> "$LOG"
if command -v setsid >/dev/null 2>&1; then
  setsid --fork pnpm dev >> "$LOG" 2>&1
else
  exec pnpm dev >> "$LOG" 2>&1
fi
