import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import type { IDatabase } from '../storage/interface.js'
import type { AppConfig } from '../config.js'

export type ItemsEnv = {
  Variables: {
    db: IDatabase
    config: AppConfig
  }
}

const items = new Hono<ItemsEnv>()

// List items
items.get('/', async (c) => {
  const db = c.get('db')
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
  const offset = parseInt(c.req.query('offset') || '0')
  const rows = await db.listItems(limit, offset)
  const total = await db.countItems()
  return c.json({ items: rows, total, limit, offset })
})

// Create text item
items.post('/', async (c) => {
  const db = c.get('db')
  const config = c.get('config')
  const body = await c.req.json()
  const content = body.content as string

  if (!content || typeof content !== 'string') {
    return c.json({ error: 'Content is required' }, 400)
  }

  if (content.length > config.MAX_TEXT_LENGTH) {
    return c.json({ error: `Content exceeds maximum length of ${config.MAX_TEXT_LENGTH} characters` }, 400)
  }

  const item = {
    id: nanoid(12),
    type: 'text' as const,
    content,
    filename: null,
    mimetype: null,
    size: new TextEncoder().encode(content).length,
    created_at: Math.floor(Date.now() / 1000),
  }

  await db.createItem(item)
  return c.json(item, 201)
})

// Get single item
items.get('/:id', async (c) => {
  const db = c.get('db')
  const item = await db.getItem(c.req.param('id'))
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json(item)
})

// Get raw text content
items.get('/:id/raw', async (c) => {
  const db = c.get('db')
  const item = await db.getItem(c.req.param('id'))
  if (!item) return c.json({ error: 'Not found' }, 404)
  if (item.type !== 'text') return c.json({ error: 'Not a text item' }, 400)
  return c.text(item.content || '')
})

// Delete item
items.delete('/:id', async (c) => {
  const db = c.get('db')
  const deleted = await db.deleteItem(c.req.param('id'))
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true })
})

export { items }
