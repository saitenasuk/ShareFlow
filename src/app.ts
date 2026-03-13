import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie } from 'hono/cookie'
import { items } from './routes/items.js'
import { files } from './routes/files.js'
import { shares } from './routes/shares.js'
import type { IDatabase, IFileStore } from './storage/interface.js'
import type { AppConfig } from './config.js'
import crypto from 'node:crypto'

export type AppEnv = {
  Variables: {
    db: IDatabase
    fileStore: IFileStore
    config: AppConfig
  }
}

function generateToken(password: string): string {
  return crypto.createHash('sha256').update(password + '__shareflow_session__').digest('hex').slice(0, 32)
}

export function createApp(db: IDatabase, fileStore: IFileStore, config: AppConfig) {
  const app = new Hono<AppEnv>()

  // CORS
  app.use('*', cors())

  // Inject dependencies
  app.use('/api/*', async (c, next) => {
    c.set('db', db)
    c.set('fileStore', fileStore)
    c.set('config', config)
    await next()
  })

  // Config endpoint (public)
  app.get('/api/config', (c) => {
    return c.json({
      maxFileSize: config.MAX_FILE_SIZE,
      maxTextLength: config.MAX_TEXT_LENGTH,
      hasPassword: !!config.AUTH_PASSWORD,
    })
  })

  // Login endpoint (public)
  app.post('/api/auth', async (c) => {
    if (!config.AUTH_PASSWORD) {
      return c.json({ success: true })
    }
    const body = await c.req.json()
    if (body.password === config.AUTH_PASSWORD) {
      const token = generateToken(config.AUTH_PASSWORD)
      setCookie(c, 'shareflow_token', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        maxAge: 3600, // 1 hour
      })
      return c.json({ success: true })
    }
    return c.json({ error: 'Incorrect password' }, 403)
  })

  // Auth check endpoint
  app.get('/api/auth/check', (c) => {
    if (!config.AUTH_PASSWORD) {
      return c.json({ authenticated: true })
    }
    const token = getCookie(c, 'shareflow_token')
    const expected = generateToken(config.AUTH_PASSWORD)
    return c.json({ authenticated: token === expected })
  })

  // Auth middleware — protect /api/* except public endpoints
  app.use('/api/*', async (c, next) => {
    // Skip auth for public endpoints
    const path = c.req.path
    // Public endpoints: config, auth, and individual share access (has an ID)
    const isPublicShareAccess = /^\/api\/shares\/[^/]+/.test(path)
    if (
      path === '/api/config' ||
      path === '/api/auth' ||
      path === '/api/auth/check' ||
      isPublicShareAccess
    ) {
      return next()
    }

    if (config.AUTH_PASSWORD) {
      const token = getCookie(c, 'shareflow_token')
      const expected = generateToken(config.AUTH_PASSWORD)
      if (token !== expected) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
    }
    await next()
  })

  // Clear all items
  app.delete('/api/items/all', async (c) => {
    const deleted = await db.deleteAll()
    // Clean up file store for file items
    for (const item of deleted) {
      if (item.type === 'file' && item.content) {
        try { await fileStore.delete(item.content) } catch {}
      }
    }
    return c.json({ deleted: deleted.length })
  })

  // Mount routes
  app.route('/api/items', items)
  app.route('/api/files', files)
  app.route('/api/shares', shares)

  return app
}
