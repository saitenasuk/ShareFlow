import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type { ClipRecord, ShareRecord, IDatabase, IFileStore } from './interface.js'

// SQLite Database Adapter (Local / Docker)
export class SqliteDatabase implements IDatabase {
  private db: Database.Database

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.db = new Database(dbPath)
  }

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('text', 'file')),
        content TEXT,
        filename TEXT,
        mimetype TEXT,
        size INTEGER,
        created_at INTEGER NOT NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC)`)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        clip_id TEXT NOT NULL,
        password TEXT,
        max_views INTEGER,
        views INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER,
        note TEXT,
        auto_delete_clip INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_shares_clip_id ON shares(clip_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares(expires_at)`)
    // Migration: add auto_delete_clip if missing
    try { this.db.exec('ALTER TABLE shares ADD COLUMN auto_delete_clip INTEGER NOT NULL DEFAULT 0') } catch {}
  }

  async listClips(limit: number, offset: number): Promise<ClipRecord[]> {
    return this.db
      .prepare('SELECT * FROM clips ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as ClipRecord[]
  }

  async getClip(id: string): Promise<ClipRecord | null> {
    return (this.db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as ClipRecord) || null
  }

  async createClip(clip: ClipRecord): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO clips (id, type, content, filename, mimetype, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(clip.id, clip.type, clip.content, clip.filename, clip.mimetype, clip.size, clip.created_at)
  }

  async deleteClip(id: string): Promise<boolean> {
    // Also delete any shares for this clip
    this.db.prepare('DELETE FROM shares WHERE clip_id = ?').run(id)
    const result = this.db.prepare('DELETE FROM clips WHERE id = ?').run(id)
    if (result.changes > 0) {
      this.db.exec('VACUUM')
      return true
    }
    return false
  }

  async countClips(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM clips').get() as any
    return row.count
  }

  async deleteAll(): Promise<ClipRecord[]> {
    const all = this.db.prepare('SELECT * FROM clips').all() as ClipRecord[]
    if (all.length > 0) {
      this.db.prepare('DELETE FROM shares').run()
      this.db.prepare('DELETE FROM clips').run()
      this.db.exec('VACUUM')
    }
    return all
  }

  async createShare(share: ShareRecord): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO shares (id, clip_id, password, max_views, views, expires_at, note, auto_delete_clip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(share.id, share.clip_id, share.password, share.max_views, share.views, share.expires_at, share.note, share.auto_delete_clip, share.created_at)
  }

  async getShare(id: string): Promise<ShareRecord | null> {
    return (this.db.prepare('SELECT * FROM shares WHERE id = ?').get(id) as ShareRecord) || null
  }

  async listShares(): Promise<(ShareRecord & { clip_type?: string; clip_filename?: string; clip_preview?: string })[]> {
    const now = Math.floor(Date.now() / 1000)
    return this.db
      .prepare(`SELECT s.*, c.type as clip_type, c.filename as clip_filename, SUBSTR(c.content, 1, 50) as clip_preview FROM shares s LEFT JOIN clips c ON s.clip_id = c.id WHERE (s.expires_at IS NULL OR s.expires_at > ?) ORDER BY s.created_at DESC`)
      .all(now) as any[]
  }

  async incrementShareViews(id: string): Promise<void> {
    this.db.prepare('UPDATE shares SET views = views + 1 WHERE id = ?').run(id)
  }

  async deleteShare(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM shares WHERE id = ?').run(id)
    if (result.changes > 0) this.db.exec('VACUUM')
    return result.changes > 0
  }

  async deleteAllShares(): Promise<number> {
    const result = this.db.prepare('DELETE FROM shares').run()
    if (result.changes > 0) this.db.exec('VACUUM')
    return result.changes
  }

  async deleteExpiredShares(): Promise<number> {
    const now = Math.floor(Date.now() / 1000)
    // Find expired shares OR max_views exceeded shares that have auto_delete_clip flag
    const expiredAutoDelete = this.db
      .prepare('SELECT clip_id FROM shares WHERE auto_delete_clip = 1 AND ((expires_at IS NOT NULL AND expires_at < ?) OR (max_views IS NOT NULL AND views >= max_views))')
      .all(now) as { clip_id: string }[]
    // Delete expired shares AND max_views exceeded shares
    const result = this.db.prepare('DELETE FROM shares WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (max_views IS NOT NULL AND views >= max_views)').run(now)
    // Auto-delete clips for flagged shares
    for (const { clip_id } of expiredAutoDelete) {
      this.db.prepare('DELETE FROM clips WHERE id = ?').run(clip_id)
    }
    if (result.changes > 0) this.db.exec('VACUUM')
    return result.changes
  }
}

// Local Filesystem File Store Adapter
export class LocalFileStore implements IFileStore {
  constructor(private baseDir: string) {
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true })
  }

  async put(key: string, data: ArrayBuffer | ReadableStream, contentType: string): Promise<void> {
    const filePath = path.join(this.baseDir, key)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    // Store metadata
    const metaPath = filePath + '.meta'
    fs.writeFileSync(metaPath, JSON.stringify({ contentType }))

    if (data instanceof ArrayBuffer) {
      fs.writeFileSync(filePath, Buffer.from(data))
    } else {
      // Handle ReadableStream
      const reader = (data as ReadableStream).getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      fs.writeFileSync(filePath, Buffer.concat(chunks))
    }
  }

  async get(key: string): Promise<{ data: ReadableStream | ArrayBuffer; contentType: string } | null> {
    const filePath = path.join(this.baseDir, key)
    if (!fs.existsSync(filePath)) return null

    const metaPath = filePath + '.meta'
    let contentType = 'application/octet-stream'
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      contentType = meta.contentType
    }

    const buffer = fs.readFileSync(filePath)
    return { data: buffer.buffer as ArrayBuffer, contentType }
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    const metaPath = filePath + '.meta'
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath)
    // Remove parent directory if empty
    const dir = path.dirname(filePath)
    try {
      const remaining = fs.readdirSync(dir)
      if (remaining.length === 0) fs.rmdirSync(dir)
    } catch {}
  }
}
