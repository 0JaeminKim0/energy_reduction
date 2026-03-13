import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './app.js'

const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Starting server on port ${port}...`)

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0'
}, (info) => {
  console.log(`Server running at http://0.0.0.0:${info.port}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})
