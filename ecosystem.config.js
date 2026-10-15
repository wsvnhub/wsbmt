module.exports = {
  apps: [
    {
      // Tên trùng với process đang chạy trên server production
      name: "next-booking",
      // Chạy thẳng node server.js — KHÔNG qua `npm start`.
      // Chạy qua npm khiến pm2 quản lý tiến trình npm thay vì node,
      // tín hiệu (SIGINT/SIGTERM/SIGUSR1) bị truyền sai và để lại tiến trình mồ côi.
      script: "server.js",
      cwd: "/home/wsbmtdeploy/wsbmt",
      instances: 1,
      exec_mode: "fork",

      // Dừng hẳn sau 10 lần restart nếu app không sống nổi 60s,
      // thay vì restart vô hạn (348 lần) và che mất sự cố.
      autorestart: true,
      max_restarts: 10,
      min_uptime: "60s",
      restart_delay: 5000,

      // Thêm timestamp vào log để dò lỗi theo thời gian
      time: true,

      kill_timeout: 10000,

      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
