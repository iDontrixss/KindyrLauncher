#!/usr/bin/env bash
set -euo pipefail

pattern="${KINDYR_PROCESS_PATTERN:-(^|[/[:space:]])(Kindyr|kindyr)([/[:space:]]|$)|electron}"
total=0
printf '%-8s %-12s %s\n' PID PSS_KiB COMMAND

while read -r pid args; do
  [[ "$args" =~ $pattern ]] || continue
  [[ -r "/proc/$pid/smaps_rollup" ]] || continue
  pss=$(awk '/^Pss:/ {print $2}' "/proc/$pid/smaps_rollup")
  total=$((total + pss))
  printf '%-8s %-12s %s\n' "$pid" "$pss" "${args:0:100}"
done < <(ps -eo pid=,args=)

printf 'TOTAL    %-12s %s\n' "$total" 'PSS KiB'
