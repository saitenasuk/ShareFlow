export interface ItemRecord {
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
  item_id: string
  password: string | null
  max_views: number | null
  views: number
  expires_at: number | null
  note: string | null
  auto_delete_item: number  // 0 or 1
  created_at: number
}

export interface IDatabase {
  initialize(): Promise<void>
  listItems(limit: number, offset: number): Promise<ItemRecord[]>
  getItem(id: string): Promise<ItemRecord | null>
  createItem(item: ItemRecord): Promise<void>
  deleteItem(id: string): Promise<boolean>
  countItems(): Promise<number>
  deleteAll(): Promise<ItemRecord[]>
  // Shares
  createShare(share: ShareRecord): Promise<void>
  getShare(id: string): Promise<ShareRecord | null>
  listShares(): Promise<(ShareRecord & { item_type?: string; item_filename?: string; item_preview?: string })[]>
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
