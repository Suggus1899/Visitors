#!/bin/sh
set -eu
# This is exclusive to the disposable GitHub runner; never execute on the Windows workstation.
test "${GITHUB_ACTIONS:-false}" = true
sudo ln -s "$PWD" /opt/logmaster
ln -s .local/containers config
sudo cp deploy/systemd/* /etc/systemd/system/
for name in backup rehearsal; do
  sudo mkdir -p "/etc/systemd/system/logmaster-$name.timer.d"
  printf '[Timer]\nOnActiveSec=1s\n' | sudo tee "/etc/systemd/system/logmaster-$name.timer.d/laboratory.conf" >/dev/null
done
sudo systemctl daemon-reload
for name in backup rehearsal; do
  sudo systemctl start "logmaster-$name.timer"
  attempt=0
  while :; do
    started=$(systemctl show "logmaster-$name.service" -p ExecMainStartTimestampMonotonic --value)
    state=$(systemctl show "logmaster-$name.service" -p ActiveState --value)
    if [ "$started" -gt 0 ] && [ "$state" != activating ]; then break; fi
    attempt=$((attempt + 1))
    if [ "$attempt" -gt 90 ]; then exit 1; fi
    sleep 2
  done
  test "$(systemctl show "logmaster-$name.service" -p Result --value)" = success
  sudo systemctl stop "logmaster-$name.timer"
done
echo 'Daily and weekly timers executed successfully ahead of schedule.'
