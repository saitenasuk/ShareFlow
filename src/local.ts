import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createApp } from './app.js'
import { SqliteDatabase, LocalFileStore } from './storage/local.js'
import { getConfig } from './config.js'
import path from 'path'
import fs from 'fs'

const config = getConfig()
const dataDir = path.resolve(config.DATA_DIR)

// Ensure data directory exists
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

const db = new SqliteDatabase(path.join(dataDir, 'clipboard.db'))
const fileStore = new LocalFileStore(path.join(dataDir, 'uploads'))

await db.initialize()

// Periodic cleanup of expired shares (runs every 60 seconds)
async function cleanupExpiredShares() {
  try {
    const deleted = await db.deleteExpiredShares()
    if (deleted > 0) console.log(`🧹 Cleaned up ${deleted} expired share(s)`)
  } catch (e) {
    console.error('Cleanup error:', e)
  }
}
cleanupExpiredShares() // Run once at startup
setInterval(cleanupExpiredShares, 60_000) // Then every 60s

const app = createApp(db, fileStore, config)

// Serve static files (Vite build output)
const distPath = path.resolve('dist')
if (fs.existsSync(distPath)) {
  app.use('/*', serveStatic({ root: './dist' }))
  // SPA fallback: serve index.html for non-API, non-static routes
  app.get('*', async (c) => {
    const indexPath = path.join(distPath, 'index.html')
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, 'utf-8')
      return c.html(html)
    }
    return c.notFound()
  })
}

console.log(`✦ ShareFlow running at http://localhost:${config.PORT}`)
console.log(`📁 Data directory: ${dataDir}`)
console.log(`📏 Max file size: ${(config.MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB`)
console.log(`📝 Max text length: ${config.MAX_TEXT_LENGTH} chars`)

serve({
  fetch: app.fetch,
  port: config.PORT,
  hostname: '0.0.0.0',
})
