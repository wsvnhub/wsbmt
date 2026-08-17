ssh root@103.2.229.143 wsbmtdeploy
ssh wsbmtdeploy@103.2.229.143
e9GU5v80

DlC6SS66sV7U@@

VlC6SS68sV8U@@


chmod -R 555 .next

passwd
docker exec -it mongodb mongosh --eval "rs.initiate()"
docker exec -it mongodb mongosh --eval "rs.status().ok"

stop 11h03 7/2/2026

scp wsbmtdeploy@103.2.229.143:/home/wsbmtdeploy/wsbmt/logs/app.log ~/Downloads/


pm2 start npm --name "schedule-booking" -- start


subdomain-owner-verification

7d5969a24672924fa5ddc28a21f09f3f