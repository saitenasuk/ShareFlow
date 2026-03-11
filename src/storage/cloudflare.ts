import type { ItemRecord, ShareRecord, IDatabase, IFileStore } from './interface.js'

// Cloudflare D1 Database Adapter
export class D1Database implements IDatabase {
  constructor(private db: D1Database) {}

  async initialize(): Promise<void> {
    await (this.db as any).exec(`
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
    await (this.db as any).exec(`
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
  }

  async listItems(limit: number, offset: number): Promise<ItemRecord[]> {
    const result = await (this.db as any)
      .prepare('SELECT * FROM items ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all()
    return result.results as ItemRecord[]
  }

  async getItem(id: string): Promise<ItemRecord | null> {
    const result = await (this.db as any)
      .prepare('SELECT * FROM items WHERE id = ?')
      .bind(id)
      .first()
    return result as ItemRecord | null
  }

  async createItem(item: ItemRecord): Promise<void> {
    await (this.db as any)
      .prepare(
        'INSERT INTO items (id, type, content, filename, mimetype, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(item.id, item.type, item.content, item.filename, item.mimetype, item.size, item.created_at)
      .run()
  }

  async deleteItem(id: string): Promise<boolean> {
    await (this.db as any).prepare('DELETE FROM shares WHERE item_id = ?').bind(id).run()
    const result = await (this.db as any)
      .prepare('DELETE FROM items WHERE id = ?')
      .bind(id)
      .run()
    return result.meta.changes > 0
  }

  async countItems(): Promise<number> {
    const result = await (this.db as any)
      .prepare('SELECT COUNT(*) as count FROM items')
      .first()
    return (result as any).count
  }

  async deleteAll(): Promise<ItemRecord[]> {
    const result = await (this.db as any)
      .prepare('SELECT * FROM items')
      .all()
    const all = result.results as ItemRecord[]
    if (all.length > 0) {
      await (this.db as any).prepare('DELETE FROM shares').run()
      await (this.db as any).prepare('DELETE FROM items').run()
    }
    return all
  }

  // --- Shares ---
  async createShare(share: ShareRecord): Promise<void> {
    await (this.db as any)
      .prepare('INSERT INTO shares (id, item_id, password, max_views, views, expires_at, note, auto_delete_item, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(share.id, share.item_id, share.password, share.max_views, share.views, share.expires_at, share.note, share.auto_delete_item, share.created_at)
      .run()
  }

  async getShare(id: string): Promise<ShareRecord | null> {
    const result = await (this.db as any).prepare('SELECT * FROM shares WHERE id = ?').bind(id).first()
    return result as ShareRecord | null
  }

  async listShares(): Promise<(ShareRecord & { item_type?: string; item_filename?: string; item_preview?: string })[]> {
    const now = Math.floor(Date.now() / 1000)
    const result = await (this.db as any)
      .prepare('SELECT s.*, c.type as item_type, c.filename as item_filename, SUBSTR(c.content, 1, 50) as item_preview FROM shares s LEFT JOIN items c ON s.item_id = c.id WHERE (s.expires_at IS NULL OR s.expires_at > ?) ORDER BY s.created_at DESC')
      .bind(now).all()
    return result.results as any[]
  }

  async incrementShareViews(id: string): Promise<void> {
    await (this.db as any).prepare('UPDATE shares SET views = views + 1 WHERE id = ?').bind(id).run()
  }

  async deleteShare(id: string): Promise<boolean> {
    const result = await (this.db as any).prepare('DELETE FROM shares WHERE id = ?').bind(id).run()
    return result.meta.changes > 0
  }

  async deleteAllShares(): Promise<number> {
    const result = await (this.db as any).prepare('DELETE FROM shares').run()
    return result.meta.changes
  }

  async deleteExpiredShares(): Promise<number> {
    const now = Math.floor(Date.now() / 1000)
    // Get items to auto-delete (expired or max_views exceeded)
    const autoDeleteResult = await (this.db as any)
      .prepare('SELECT item_id FROM shares WHERE auto_delete_item = 1 AND ((expires_at IS NOT NULL AND expires_at < ?) OR (max_views IS NOT NULL AND views >= max_views))')
      .bind(now).all()
    const result = await (this.db as any)
      .prepare('DELETE FROM shares WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (max_views IS NOT NULL AND views >= max_views)')
      .bind(now).run()
    for (const row of autoDeleteResult.results) {
      await (this.db as any).prepare('DELETE FROM items WHERE id = ?').bind(row.item_id).run()
    }
    return result.meta.changes
  }
}

// Cloudflare R2 File Store Adapter
export class R2FileStore implements IFileStore {
  constructor(private bucket: R2Bucket) {}

  async put(key: string, data: ArrayBuffer | ReadableStream, contentType: string): Promise<void> {
    await this.bucket.put(key, data, {
      httpMetadata: { contentType }
    })
  }

  async get(key: string): Promise<{ data: ReadableStream | ArrayBuffer; contentType: string } | null> {
    const obj = await this.bucket.get(key)
    if (!obj) return null
    return {
      data: obj.body,
      contentType: obj.httpMetadata?.contentType || 'application/octet-stream'
    }
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key)
  }
}
