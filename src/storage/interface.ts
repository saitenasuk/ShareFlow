export interface ClipRecord {
  id: string
  type: 'text' | 'file'
  content: string | null
  filename: string | null
  mimetype: string | null
  size: number | null
  created_at: number
}

export interface ShareRecord {
  id: string
  clip_id: string
  password: string | null
  max_views: number | null
  views: number
  expires_at: number | null
  note: string | null
  auto_delete_clip: number  // 0 or 1
  created_at: number
}

export interface IDatabase {
  initialize(): Promise<void>
  listClips(limit: number, offset: number): Promise<ClipRecord[]>
  getClip(id: string): Promise<ClipRecord | null>
  createClip(clip: ClipRecord): Promise<void>
  deleteClip(id: string): Promise<boolean>
  countClips(): Promise<number>
  deleteAll(): Promise<ClipRecord[]>
  // Shares
  createShare(share: ShareRecord): Promise<void>
  getShare(id: string): Promise<ShareRecord | null>
  listShares(): Promise<(ShareRecord & { clip_type?: string; clip_filename?: string; clip_preview?: string })[]>
  incrementShareViews(id: string): Promise<void>
  deleteShare(id: string): Promise<boolean>
  deleteAllShares(): Promise<number>
  deleteExpiredShares(): Promise<number>
}

export interface IFileStore {
  put(key: string, data: ArrayBuffer | ReadableStream, contentType: string): Promise<void>
  get(key: string): Promise<{ data: ReadableStream | ArrayBuffer; contentType: string } | null>
  delete(key: string): Promise<void>
}
