#!/bin/bash
set -a
source /root/wsbmt/.env
set +a
cd /root
/usr/bin/node ./wsbmt/utils/countTimeslots.js >> /root/wsbmt/daily_task.log 2>&1