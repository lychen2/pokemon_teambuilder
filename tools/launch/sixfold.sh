#!/usr/bin/env bash
# 普通模式：启动已打包的桌面应用 release/<版本>/linux-unpacked/<可执行文件>。
# - 自动挑选版本号最高的已打包目录，重新打包后不需要手改脚本；
# - 窗口已打开时只聚焦（niri），不重复启动；
# - 用 setsid 脱离当前会话，关掉启动它的终端不影响应用；
# - 输出（含 Electron / lsfg-vk 噪声）写入 ${XDG_STATE_HOME:-~/.local/state}/sixfold/app.log。
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_ID="sixfold"
DISPLAY_NAME="结阵 Sixfold"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/sixfold"
LOG="$STATE_DIR/app.log"
mkdir -p "$STATE_DIR"
# shellcheck source=tools/launch/lib.sh
. "$APP_DIR/tools/launch/lib.sh"

fail() {
  echo "sixfold: $1" >&2
  if command -v notify-send >/dev/null 2>&1; then
    notify-send --app-name="$DISPLAY_NAME" --icon="$APP_ID" "无法启动 $DISPLAY_NAME" "$1" || true
  fi
  exit 1
}

# 可执行文件名跟随 package.json 的 linux.executableName；重构前的产物叫 poke-teambuilder。
find_packaged_binary() {
  local dir name
  for dir in $(ls -1d "$APP_DIR"/release/*/linux-unpacked 2>/dev/null | sort -V -r); do
    for name in sixfold poke-teambuilder; do
      if [ -x "$dir/$name" ]; then printf '%s\n' "$dir/$name"; return 0; fi
    done
  done
  return 1
}

BIN="$(find_packaged_binary || true)"
[ -n "$BIN" ] || fail "未找到已打包的应用：release/<版本>/linux-unpacked/
请先运行 pnpm package:linux 重新打包，或改用「$DISPLAY_NAME (开发者模式)」入口。"

poke_focus_existing_window "$APP_ID" && exit 0

cd "$APP_DIR"
printf '\n=== %s 启动已打包应用 %s ===\n' "$(date -Is)" "$BIN" >> "$LOG"
if command -v setsid >/dev/null 2>&1; then
  setsid --fork "$BIN" "$@" >> "$LOG" 2>&1
else
  exec "$BIN" "$@" >> "$LOG" 2>&1
fi
