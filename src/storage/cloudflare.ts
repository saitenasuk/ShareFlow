import type { ClipRecord, ShareRecord, IDatabase, IFileStore } from './interface.js'

// Cloudflare D1 Database Adapter
export class D1Database implements IDatabase {
  constructor(private db: D1Database) {}

  async initialize(): Promise<void> {
    await (this.db as any).exec(`
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
    await (this.db as any).exec(`
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
  }

  async listClips(limit: number, offset: number): Promise<ClipRecord[]> {
    const result = await (this.db as any)
      .prepare('SELECT * FROM clips ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(limit, offset)
      .all()
    return result.results as ClipRecord[]
  }

  async getClip(id: string): Promise<ClipRecord | null> {
    const result = await (this.db as any)
      .prepare('SELECT * FROM clips WHERE id = ?')
      .bind(id)
      .first()
    return result as ClipRecord | null
  }

  async createClip(clip: ClipRecord): Promise<void> {
    await (this.db as any)
      .prepare(
        'INSERT INTO clips (id, type, content, filename, mimetype, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(clip.id, clip.type, clip.content, clip.filename, clip.mimetype, clip.size, clip.created_at)
      .run()
  }

  async deleteClip(id: string): Promise<boolean> {
    await (this.db as any).prepare('DELETE FROM shares WHERE clip_id = ?').bind(id).run()
    const result = await (this.db as any)
      .prepare('DELETE FROM clips WHERE id = ?')
      .bind(id)
      .run()
    return result.meta.changes > 0
  }

  async countClips(): Promise<number> {
    const result = await (this.db as any)
      .prepare('SELECT COUNT(*) as count FROM clips')
      .first()
    return (result as any).count
  }

  async deleteAll(): Promise<ClipRecord[]> {
    const result = await (this.db as any)
      .prepare('SELECT * FROM clips')
      .all()
    const all = result.results as ClipRecord[]
    if (all.length > 0) {
      await (this.db as any).prepare('DELETE FROM shares').run()
      await (this.db as any).prepare('DELETE FROM clips').run()
    }
    return all
  }

  // --- Shares ---
  async createShare(share: ShareRecord): Promise<void> {
    await (this.db as any)
      .prepare('INSERT INTO shares (id, clip_id, password, max_views, views, expires_at, note, auto_delete_clip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(share.id, share.clip_id, share.password, share.max_views, share.views, share.expires_at, share.note, share.auto_delete_clip, share.created_at)
      .run()
  }

  async getShare(id: string): Promise<ShareRecord | null> {
    const result = await (this.db as any).prepare('SELECT * FROM shares WHERE id = ?').bind(id).first()
    return result as ShareRecord | null
  }

  async listShares(): Promise<(ShareRecord & { clip_type?: string; clip_filename?: string; clip_preview?: string })[]> {
    const now = Math.floor(Date.now() / 1000)
    const result = await (this.db as any)
      .prepare('SELECT s.*, c.type as clip_type, c.filename as clip_filename, SUBSTR(c.content, 1, 50) as clip_preview FROM shares s LEFT JOIN clips c ON s.clip_id = c.id WHERE (s.expires_at IS NULL OR s.expires_at > ?) ORDER BY s.created_at DESC')
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
    // Get clips to auto-delete (expired or max_views exceeded)
    const autoDeleteResult = await (this.db as any)
      .prepare('SELECT clip_id FROM shares WHERE auto_delete_clip = 1 AND ((expires_at IS NOT NULL AND expires_at < ?) OR (max_views IS NOT NULL AND views >= max_views))')
      .bind(now).all()
    const result = await (this.db as any)
      .prepare('DELETE FROM shares WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (max_views IS NOT NULL AND views >= max_views)')
      .bind(now).run()
    for (const row of autoDeleteResult.results) {
      await (this.db as any).prepare('DELETE FROM clips WHERE id = ?').bind(row.clip_id).run()
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
