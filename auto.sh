#!/bin/bash

# 1. Đảm bảo PATH đầy đủ cho cron
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# 2. Load biến môi trường từ .env (nếu có)
set -a
[ -f /root/wsbmt/.env ] && source /root/wsbmt/.env
set +a

# 3. Ghi log để kiểm tra cron thực sự có chạy
echo "=== [$(date)] Running countTimeslots.js via cron ===" >> /root/wsbmt/cron.log

# 4. Chạy NodeJS script
/usr/bin/env node /root/wsbmt/utils/countTimeslots.js >> /root/wsbmt/cron.log 2>&1

# 5. Ghi log kết thúc
echo "=== End ===" >> /root/wsbmt/cron.log
