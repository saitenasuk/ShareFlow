import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import type { IDatabase } from '../storage/interface.js'
import type { AppConfig } from '../config.js'

export type ClipsEnv = {
  Variables: {
    db: IDatabase
    config: AppConfig
  }
}

const clips = new Hono<ClipsEnv>()

// List clips
clips.get('/', async (c) => {
  const db = c.get('db')
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
  const offset = parseInt(c.req.query('offset') || '0')
  const items = await db.listClips(limit, offset)
  const total = await db.countClips()
  return c.json({ items, total, limit, offset })
})

// Create text clip
clips.post('/', async (c) => {
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

  const clip = {
    id: nanoid(12),
    type: 'text' as const,
    content,
    filename: null,
    mimetype: null,
    size: new TextEncoder().encode(content).length,
    created_at: Math.floor(Date.now() / 1000),
  }

  await db.createClip(clip)
  return c.json(clip, 201)
})

// Get single clip
clips.get('/:id', async (c) => {
  const db = c.get('db')
  const clip = await db.getClip(c.req.param('id'))
  if (!clip) return c.json({ error: 'Not found' }, 404)
  return c.json(clip)
})

// Get raw text content
clips.get('/:id/raw', async (c) => {
  const db = c.get('db')
  const clip = await db.getClip(c.req.param('id'))
  if (!clip) return c.json({ error: 'Not found' }, 404)
  if (clip.type !== 'text') return c.json({ error: 'Not a text clip' }, 400)
  return c.text(clip.content || '')
})

// Delete clip
clips.delete('/:id', async (c) => {
  const db = c.get('db')
  const deleted = await db.deleteClip(c.req.param('id'))
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true })
})

export { clips }
