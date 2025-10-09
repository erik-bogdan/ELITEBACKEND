module.exports = {
    apps: [
      {
        name     : 'elysia',
        script   : './server',
        env_file : '.env',
        cwd: '//home/elitebeerpong/backend',
        env: {
          NODE_ENV: 'production'
        }
      }
    ]
  }
  