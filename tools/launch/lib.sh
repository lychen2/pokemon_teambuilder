#!/usr/bin/env bash
# 供 tools/launch/*.sh 复用：如果应用窗口已经打开，就聚焦那个窗口而不是重复启动。
# 依赖 niri（Wayland 合成器）与 node（解析 niri 的 JSON 输出）；缺失时返回 1，调用方照常启动新实例。
# 注意：本机 niri 开启了 focus-follows-mouse，聚焦后指针所在窗口可能立刻夺回焦点，这是合成器行为，不影响“不重复启动”。

poke_focus_existing_window() {
  local app_id="${1:-sixfold}" window_id
  command -v niri >/dev/null 2>&1 || return 1
  command -v node >/dev/null 2>&1 || return 1
  window_id="$(niri msg --json windows 2>/dev/null | node -e '
    let raw = "";
    process.stdin.on("data", chunk => raw += chunk).on("end", () => {
      try {
        const hit = JSON.parse(raw).find(window => window.app_id === process.argv[1]);
        if (hit) process.stdout.write(String(hit.id));
      } catch {}
    });
  ' "$app_id")"
  [ -n "$window_id" ] || return 1
  niri msg action focus-window --id "$window_id" >/dev/null 2>&1
}
