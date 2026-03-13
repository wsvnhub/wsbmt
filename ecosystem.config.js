module.exports = {
  apps: [
    {
      name: "nextjs-app",
      script: "server.js",
      cwd: "/home/wsbmtdeploy/wsbmt",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}