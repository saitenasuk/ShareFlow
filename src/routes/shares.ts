import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import type { IDatabase, IFileStore } from '../storage/interface.js'
import type { AppConfig } from '../config.js'

export type SharesEnv = {
  Variables: {
    db: IDatabase
    fileStore: IFileStore
    config: AppConfig
  }
}

const shares = new Hono<SharesEnv>()

// List all shares (auth required - handled by middleware)
shares.get('/', async (c) => {
  const db = c.get('db')
  const result = await db.listShares()
  return c.json({ items: result })
})

// Create a share
shares.post('/', async (c) => {
  const db = c.get('db')
  const body = await c.req.json()
  const { item_id, password, max_views, expires_in, note, auto_delete_item } = body

  if (!item_id) return c.json({ error: 'item_id is required' }, 400)

  const item = await db.getItem(item_id)
  if (!item) return c.json({ error: 'Item not found' }, 404)

  const now = Math.floor(Date.now() / 1000)
  const share = {
    id: nanoid(10),
    item_id,
    password: password || null,
    max_views: max_views ? parseInt(max_views, 10) : null,
    views: 0,
    expires_at: expires_in ? now + parseInt(expires_in, 10) : null,
    note: note || null,
    auto_delete_item: auto_delete_item ? 1 : 0,
    created_at: now,
  }

  await db.createShare(share)

  const baseUrl = new URL(c.req.url).origin
  return c.json({
    ...share,
    url: `${baseUrl}/s/${share.id}`,
  }, 201)
})

// Get share info (public — no auth required)
shares.get('/:id', async (c) => {
  const db = c.get('db')
  const share = await db.getShare(c.req.param('id'))
  if (!share) return c.json({ error: 'Share not found' }, 404)

  // Check expiry
  if (share.expires_at && Math.floor(Date.now() / 1000) > share.expires_at) {
    await db.deleteShare(share.id)
    return c.json({ error: 'Share has expired' }, 410)
  }

  // Check view limit
  if (share.max_views !== null && share.views >= share.max_views) {
    return c.json({ error: 'Share view limit reached' }, 410)
  }

  const item = await db.getItem(share.item_id)
  if (!item) {
    await db.deleteShare(share.id)
    return c.json({ error: 'Shared content no longer exists' }, 404)
  }

  return c.json({
    id: share.id,
    type: item.type,
    has_password: !!share.password,
    max_views: share.max_views,
    views: share.views,
    expires_at: share.expires_at,
    note: share.note,
    filename: item.filename,
    mimetype: item.mimetype,
    size: item.size,
    created_at: share.created_at,
  })
})

// Verify share password
shares.post('/:id/verify', async (c) => {
  const db = c.get('db')
  const share = await db.getShare(c.req.param('id'))
  if (!share) return c.json({ error: 'Share not found' }, 404)

  const body = await c.req.json()
  if (share.password && body.password !== share.password) {
    return c.json({ error: 'Incorrect password' }, 403)
  }

  return c.json({ success: true })
})

// Get share content (increments view count)
shares.get('/:id/content', async (c) => {
  const db = c.get('db')
  const share = await db.getShare(c.req.param('id'))
  if (!share) return c.json({ error: 'Share not found' }, 404)

  // Check expiry
  if (share.expires_at && Math.floor(Date.now() / 1000) > share.expires_at) {
    await db.deleteShare(share.id)
    return c.json({ error: 'Share has expired' }, 410)
  }

  // Check view limit
  if (share.max_views !== null && share.views >= share.max_views) {
    return c.json({ error: 'Share view limit reached' }, 410)
  }

  // Check password (via query param or header)
  const pwd = c.req.query('pwd') || c.req.header('X-Share-Password') || ''
  if (share.password && pwd !== share.password) {
    return c.json({ error: 'Password required' }, 403)
  }

  const item = await db.getItem(share.item_id)
  if (!item) {
    await db.deleteShare(share.id)
    return c.json({ error: 'Shared content no longer exists' }, 404)
  }

  // Increment views
  await db.incrementShareViews(share.id)

  if (item.type === 'text') {
    return c.json({
      type: 'text',
      content: item.content,
      note: share.note,
    })
  }

  // For files, return file metadata (actual download via /download)
  return c.json({
    type: 'file',
    filename: item.filename,
    mimetype: item.mimetype,
    size: item.size,
    note: share.note,
  })
})

// Download shared file
shares.get('/:id/download', async (c) => {
  const db = c.get('db')
  const fileStore = c.get('fileStore')
  const share = await db.getShare(c.req.param('id'))
  if (!share) return c.json({ error: 'Share not found' }, 404)

  // Check expiry
  if (share.expires_at && Math.floor(Date.now() / 1000) > share.expires_at) {
    await db.deleteShare(share.id)
    return c.json({ error: 'Share has expired' }, 410)
  }

  // Check view limit
  if (share.max_views !== null && share.views >= share.max_views) {
    return c.json({ error: 'Share view limit reached' }, 410)
  }

  // Check password
  const pwd = c.req.query('pwd') || c.req.header('X-Share-Password') || ''
  if (share.password && pwd !== share.password) {
    return c.json({ error: 'Password required' }, 403)
  }

  const item = await db.getItem(share.item_id)
  if (!item || item.type !== 'file') {
    return c.json({ error: 'File not found' }, 404)
  }

  const file = await fileStore.get(item.content!)
  if (!file) return c.json({ error: 'File data not found' }, 404)

  const headers = new Headers()
  headers.set('Content-Type', file.contentType)
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename || 'file')}"`)

  if (file.data instanceof ArrayBuffer) {
    return new Response(file.data, { headers })
  }
  return new Response(file.data as ReadableStream, { headers })
})

// Delete share
shares.delete('/:id', async (c) => {
  const db = c.get('db')
  const deleted = await db.deleteShare(c.req.param('id'))
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true })
})

// Clear all shares
shares.delete('/', async (c) => {
  const db = c.get('db')
  const count = await db.deleteAllShares()
  return c.json({ success: true, deleted: count })
})

export { shares }
