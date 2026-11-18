#!/bin/sh
# ghost-step <index> <cwd> <action>
#
# Runs one plan action under strace and closes the step in steps.jsonl. The Docker CLI sets
# the working directory (docker exec -w), so <cwd> is informational here. The action is
# passed to `sh -c` as one argument; it is never spliced into another command line.
set -u

REC=${GHOST_REC_DIR:-/ghost-rec}
INIT=${GHOST_INIT:-ghost-init}

if [ "$#" -ne 3 ]; then
  echo "usage: ghost-step <index> <cwd> <action>" >&2
  exit 64
fi
idx=$1
action=$3
case $idx in
  '' | *[!0-9]*)
    echo "ghost-step: step index must be a non-negative integer" >&2
    exit 64
    ;;
esac

# Listeners read the step index per event.
printf '%s' "$idx" > "$REC/current-step.tmp" && mv -f "$REC/current-step.tmp" "$REC/current-step"

# Wait up to 2 s for the recorder. Run the action regardless; a missing recorder shows up
# as a failed probe below.
n=0
while [ ! -f "$REC/ready" ] && [ "$n" -lt 20 ]; do
  sleep 0.1
  n=$((n + 1))
done

strace -f -qq -s 256 --seccomp-bpf \
  -e trace=openat,open,openat2,connect,chdir,fchdir -e signal=none \
  -y -o "$REC/step-$idx.strace" -- sh -c "$action"
code=$?

# Recorder liveness probe, outside strace so it is never recorded.
if "$INIT" --probe > /dev/null 2>&1; then
  probe=true
else
  probe=false
fi

printf '{"end":%s,"exit":%s,"probe":%s}\n' "$idx" "$code" "$probe" >> "$REC/steps.jsonl"
exit "$code"
