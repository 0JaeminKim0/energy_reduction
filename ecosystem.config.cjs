module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'node',
      args: 'dist/server.js',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
