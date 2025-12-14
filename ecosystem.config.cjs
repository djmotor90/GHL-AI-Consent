module.exports = {
  apps: [{
    name: 'ghl-consent-api',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Restart策略
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    
    // 高级选项
    kill_timeout: 5000,
    wait_ready: false,
    listen_timeout: 3000,
    
    // Environment specific config
    env_development: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
