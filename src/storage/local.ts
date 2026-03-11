import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type { ItemRecord, ShareRecord, IDatabase, IFileStore } from './interface.js'

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
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('text', 'file')),
        content TEXT,
        filename TEXT,
        mimetype TEXT,
        size INTEGER,
        created_at INTEGER NOT NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC)`)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        password TEXT,
        max_views INTEGER,
        views INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER,
        note TEXT,
        auto_delete_item INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_shares_item_id ON shares(item_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares(expires_at)`)
    // Migration: add auto_delete_item if missing
    try { this.db.exec('ALTER TABLE shares ADD COLUMN auto_delete_item INTEGER NOT NULL DEFAULT 0') } catch {}
  }

  async listItems(limit: number, offset: number): Promise<ItemRecord[]> {
    return this.db
      .prepare('SELECT * FROM items ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as ItemRecord[]
  }

  async getItem(id: string): Promise<ItemRecord | null> {
    return (this.db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRecord) || null
  }

  async createItem(item: ItemRecord): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO items (id, type, content, filename, mimetype, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(item.id, item.type, item.content, item.filename, item.mimetype, item.size, item.created_at)
  }

  async deleteItem(id: string): Promise<boolean> {
    // Also delete any shares for this item
    this.db.prepare('DELETE FROM shares WHERE item_id = ?').run(id)
    const result = this.db.prepare('DELETE FROM items WHERE id = ?').run(id)
    if (result.changes > 0) {
      this.db.exec('VACUUM')
      return true
    }
    return false
  }

  async countItems(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM items').get() as any
    return row.count
  }

  async deleteAll(): Promise<ItemRecord[]> {
    const all = this.db.prepare('SELECT * FROM items').all() as ItemRecord[]
    if (all.length > 0) {
      this.db.prepare('DELETE FROM shares').run()
      this.db.prepare('DELETE FROM items').run()
      this.db.exec('VACUUM')
    }
    return all
  }

  async createShare(share: ShareRecord): Promise<void> {
    this.db
      .prepare(
        'INSERT INTO shares (id, item_id, password, max_views, views, expires_at, note, auto_delete_item, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(share.id, share.item_id, share.password, share.max_views, share.views, share.expires_at, share.note, share.auto_delete_item, share.created_at)
  }

  async getShare(id: string): Promise<ShareRecord | null> {
    return (this.db.prepare('SELECT * FROM shares WHERE id = ?').get(id) as ShareRecord) || null
  }

  async listShares(): Promise<(ShareRecord & { item_type?: string; item_filename?: string; item_preview?: string })[]> {
    const now = Math.floor(Date.now() / 1000)
    return this.db
      .prepare(`SELECT s.*, c.type as item_type, c.filename as item_filename, SUBSTR(c.content, 1, 50) as item_preview FROM shares s LEFT JOIN items c ON s.item_id = c.id WHERE (s.expires_at IS NULL OR s.expires_at > ?) ORDER BY s.created_at DESC`)
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
    // Find expired shares OR max_views exceeded shares that have auto_delete_item flag
    const expiredAutoDelete = this.db
      .prepare('SELECT item_id FROM shares WHERE auto_delete_item = 1 AND ((expires_at IS NOT NULL AND expires_at < ?) OR (max_views IS NOT NULL AND views >= max_views))')
      .all(now) as { item_id: string }[]
    // Delete expired shares AND max_views exceeded shares
    const result = this.db.prepare('DELETE FROM shares WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (max_views IS NOT NULL AND views >= max_views)').run(now)
    // Auto-delete items for flagged shares
    for (const { item_id } of expiredAutoDelete) {
      this.db.prepare('DELETE FROM items WHERE id = ?').run(item_id)
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
