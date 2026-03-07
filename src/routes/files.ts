import { Hono } from 'hono'
import { nanoid } from 'nanoid'
import type { IDatabase, IFileStore } from '../storage/interface.js'
import type { AppConfig } from '../config.js'

export type FilesEnv = {
  Variables: {
    db: IDatabase
    fileStore: IFileStore
    config: AppConfig
  }
}

const files = new Hono<FilesEnv>()

// Upload file
files.post('/', async (c) => {
  const db = c.get('db')
  const fileStore = c.get('fileStore')
  const config = c.get('config')

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return c.json({ error: 'No file provided' }, 400)
  }

  if (file.size > config.MAX_FILE_SIZE) {
    const maxMB = (config.MAX_FILE_SIZE / 1024 / 1024).toFixed(1)
    return c.json({ error: `File exceeds maximum size of ${maxMB}MB` }, 400)
  }

  const id = nanoid(12)
  const fileKey = `files/${id}/${file.name}`

  // Store file
  const arrayBuffer = await file.arrayBuffer()
  await fileStore.put(fileKey, arrayBuffer, file.type || 'application/octet-stream')

  // Create clip record
  const clip = {
    id,
    type: 'file' as const,
    content: fileKey,
    filename: file.name,
    mimetype: file.type || 'application/octet-stream',
    size: file.size,
    created_at: Math.floor(Date.now() / 1000),
  }

  await db.createClip(clip)
  return c.json(clip, 201)
})

// Download file
files.get('/:id', async (c) => {
  const db = c.get('db')
  const fileStore = c.get('fileStore')

  const clip = await db.getClip(c.req.param('id'))
  if (!clip || clip.type !== 'file') {
    return c.json({ error: 'File not found' }, 404)
  }

  const file = await fileStore.get(clip.content!)
  if (!file) {
    return c.json({ error: 'File data not found' }, 404)
  }

  const headers = new Headers()
  headers.set('Content-Type', file.contentType)
  headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(clip.filename || 'file')}"`)

  if (file.data instanceof ArrayBuffer) {
    return new Response(file.data, { headers })
  }
  return new Response(file.data as ReadableStream, { headers })
})

// Get file for inline display (images)
files.get('/:id/preview', async (c) => {
  const db = c.get('db')
  const fileStore = c.get('fileStore')

  const clip = await db.getClip(c.req.param('id'))
  if (!clip || clip.type !== 'file') {
    return c.json({ error: 'File not found' }, 404)
  }

  const file = await fileStore.get(clip.content!)
  if (!file) {
    return c.json({ error: 'File data not found' }, 404)
  }

  const headers = new Headers()
  headers.set('Content-Type', file.contentType)
  headers.set('Cache-Control', 'public, max-age=3600')

  if (file.data instanceof ArrayBuffer) {
    return new Response(file.data, { headers })
  }
  return new Response(file.data as ReadableStream, { headers })
})

// Delete file
files.delete('/:id', async (c) => {
  const db = c.get('db')
  const fileStore = c.get('fileStore')

  const clip = await db.getClip(c.req.param('id'))
  if (!clip || clip.type !== 'file') {
    return c.json({ error: 'File not found' }, 404)
  }

  // Delete file from store
  if (clip.content) {
    await fileStore.delete(clip.content)
  }

  // Delete record
  await db.deleteClip(clip.id)
  return c.json({ success: true })
})

export { files }
