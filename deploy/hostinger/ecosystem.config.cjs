/**
 * PM2 configuration for a Hostinger VPS or Node.js server.
 * Replace `cwd` with the absolute directory where the archive is extracted.
 * Keep secrets in deploy/hostinger/.env or Hostinger's environment settings.
 */
module.exports = {
  apps: [{
    name: "tapboss",
    cwd: "/home/your-user/tapboss",
    script: "artifacts/api-server/dist/index.mjs",
    interpreter: "node",
    node_args: "--env-file=.env --enable-source-maps",
    env: {
      NODE_ENV: "production",
      PORT: 8080,
      WEB_DIST_DIR: "/home/your-user/tapboss/artifacts/tapashub/dist/public"
    },
    time: true,
    max_memory_restart: "768M",
    kill_timeout: 10000,
    listen_timeout: 15000,
    restart_delay: 3000,
    autorestart: true
  }]
};