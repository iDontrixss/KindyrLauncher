#!/usr/bin/env bash
set -euo pipefail

pattern="${KINDYR_PROCESS_PATTERN:-(^|[/[:space:]])(Kindyr|kindyr)([/[:space:]]|$)|electron}"
printf '%-8s %-12s %-12s %-12s %s\n' PID RSS_KiB PSS_KiB PRIVATE_KiB COMMAND

ps -eo pid=,args= | while read -r pid args; do
  [[ "$pid" == "$$" ]] && continue
  [[ "$args" =~ $pattern ]] || continue
  [[ -r "/proc/$pid/status" ]] || continue
  rss=$(awk '/^VmRSS:/ {print $2}' "/proc/$pid/status" 2>/dev/null || true)
  rollup="/proc/$pid/smaps_rollup"
  [[ -r "$rollup" ]] || continue
  pss=$(awk '/^Pss:/ {print $2}' "$rollup")
  private=$(awk '/^Private_(Clean|Dirty):/ {sum += $2} END {print sum + 0}' "$rollup")
  printf '%-8s %-12s %-12s %-12s %s\n' "$pid" "${rss:-0}" "$pss" "$private" "${args:0:100}"
done
