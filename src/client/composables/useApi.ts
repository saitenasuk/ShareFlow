import { ref, type Ref } from 'vue'

export interface Clip {
  id: string
  type: 'text' | 'file'
  content: string | null
  filename: string | null
  mimetype: string | null
  size: number | null
  created_at: number
}

export interface AppConfigData {
  maxFileSize: number
  maxTextLength: number
  hasPassword: boolean
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface ShareInfo {
  id: string
  type: 'text' | 'file'
  has_password: boolean
  max_views: number | null
  views: number
  expires_at: number | null
  note: string | null
  filename: string | null
  mimetype: string | null
  size: number | null
  created_at: number
}

export interface ShareContent {
  type: 'text' | 'file'
  content?: string
  filename?: string
  mimetype?: string
  size?: number
  note: string | null
}

export interface ShareListItem {
  id: string
  clip_id: string
  has_password: boolean
  password: string | null
  max_views: number | null
  views: number
  expires_at: number | null
  note: string | null
  auto_delete_clip: number
  created_at: number
  clip_type?: string
  clip_filename?: string
  clip_preview?: string
}

const API_BASE = '/api'

export function useApi() {
  const loading = ref(false)
  const error: Ref<string | null> = ref(null)

  async function fetchConfig(): Promise<AppConfigData> {
    const res = await fetch(`${API_BASE}/config`)
    return res.json()
  }

  async function login(password: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) return false
    const data = await res.json()
    return data.success === true
  }

  async function checkAuth(): Promise<boolean> {
    const res = await fetch(`${API_BASE}/auth/check`)
    const data = await res.json()
    return data.authenticated === true
  }

  async function fetchClips(limit = 50, offset = 0) {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/clips?limit=${limit}&offset=${offset}`)
      if (!res.ok) throw new Error('Failed to fetch clips')
      return await res.json()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createTextClip(content: string): Promise<Clip> {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create clip')
      }
      return await res.json()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function uploadFile(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Clip> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
          })
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          try {
            const data = JSON.parse(xhr.responseText)
            reject(new Error(data.error || 'Upload failed'))
          } catch {
            reject(new Error('Upload failed'))
          }
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

      xhr.open('POST', `${API_BASE}/files`)
      xhr.send(formData)
    })
  }

  async function deleteClip(id: string, type: 'text' | 'file'): Promise<void> {
    const endpoint = type === 'file' ? `${API_BASE}/files/${id}` : `${API_BASE}/clips/${id}`
    const res = await fetch(endpoint, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete')
  }

  async function clearAll(): Promise<number> {
    const res = await fetch(`${API_BASE}/clips/all`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to clear all')
    const data = await res.json()
    return data.deleted
  }

  // --- Share API ---
  async function createShare(opts: {
    clip_id: string
    password?: string
    max_views?: number
    expires_in?: number
    note?: string
    auto_delete_clip?: boolean
  }): Promise<{ id: string; url: string }> {
    const res = await fetch(`${API_BASE}/shares`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to create share')
    }
    return res.json()
  }

  async function getShareInfo(id: string): Promise<ShareInfo> {
    const res = await fetch(`${API_BASE}/shares/${id}`)
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Share not found')
    }
    return res.json()
  }

  async function verifySharePassword(id: string, password: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/shares/${id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    return res.ok
  }

  async function getShareContent(id: string, password?: string): Promise<ShareContent> {
    const url = password
      ? `${API_BASE}/shares/${id}/content?pwd=${encodeURIComponent(password)}`
      : `${API_BASE}/shares/${id}/content`
    const res = await fetch(url)
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to get content')
    }
    return res.json()
  }

  function getShareDownloadUrl(id: string, password?: string): string {
    return password
      ? `${API_BASE}/shares/${id}/download?pwd=${encodeURIComponent(password)}`
      : `${API_BASE}/shares/${id}/download`
  }

  function getFileUrl(id: string): string {
    return `${API_BASE}/files/${id}`
  }

  function getPreviewUrl(id: string): string {
    return `${API_BASE}/files/${id}/preview`
  }

  async function listShares(): Promise<ShareListItem[]> {
    const res = await fetch(`${API_BASE}/shares`)
    if (!res.ok) throw new Error('Failed to fetch shares')
    const data = await res.json()
    return data.items || []
  }

  async function deleteShareById(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/shares/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete share')
  }

  async function deleteAllShares(): Promise<void> {
    const res = await fetch(`${API_BASE}/shares`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to clear shares')
  }

  return {
    loading,
    error,
    fetchConfig,
    login,
    checkAuth,
    fetchClips,
    createTextClip,
    uploadFile,
    deleteClip,
    clearAll,
    createShare,
    listShares,
    deleteShareById,
    deleteAllShares,
    getShareInfo,
    verifySharePassword,
    getShareContent,
    getShareDownloadUrl,
    getFileUrl,
    getPreviewUrl,
  }
}
