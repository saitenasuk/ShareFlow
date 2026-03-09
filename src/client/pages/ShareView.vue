<template>
  <div class="share-page">
    <div class="share-page-inner">
      <h1 class="share-page-title"><img src="/icons/logo.png" alt="ShareFlow" class="logo-img" /> ShareFlow</h1>

      <!-- Loading -->
      <div v-if="loading" class="share-page-card glass-card">
        <div class="share-page-center"><span class="spinner"></span> 加载中...</div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="share-page-card glass-card">
        <div class="share-page-center">
          <div style="font-size: 3rem; margin-bottom: 16px">😕</div>
          <h2 style="margin-bottom: 8px">{{ error }}</h2>
          <p style="color: var(--text-muted)">此分享可能已过期、达到查看上限或已被删除</p>
        </div>
      </div>

      <!-- Password required -->
      <div v-else-if="needPassword" class="share-page-card glass-card">
        <div class="share-page-center">
          <div style="font-size: 2.5rem; margin-bottom: 16px">🔒</div>
          <h2 style="margin-bottom: 16px">此分享需要密码</h2>
          <form @submit.prevent="handlePasswordSubmit" class="share-password-form" style="position:relative">
            <input
              v-model="passwordInput"
              type="password"
              placeholder="输入访问密码..."
              class="login-input"
              autofocus
            />
            <button type="submit" class="btn btn-primary login-btn" :disabled="verifying" style="text-align:center;width:100%">
              {{ verifying ? '验证中...' : '确认' }}
            </button>
            <p v-if="passwordError" class="login-error" style="position:absolute;bottom:-28px;left:0;right:0">密码错误</p>
          </form>
        </div>
      </div>

      <!-- Content loaded -->
      <div v-else class="share-page-card glass-card">
        <div class="share-page-header">
          <div class="share-page-meta">
            <span v-if="shareInfo?.note" class="share-note-badge">📝 {{ shareInfo.note }}</span>
            <span v-if="shareInfo?.max_views" class="share-meta-item">
              👁️ {{ shareInfo.views + 1 }}/{{ shareInfo.max_views }} 次查看
            </span>
            <span v-if="shareInfo?.expires_at" class="share-meta-item">
              ⏳ {{ formatExpiry(shareInfo.expires_at) }}
            </span>
          </div>
        </div>

        <!-- Text Share -->
        <div v-if="content?.type === 'text'" class="share-content-text">
          <pre class="share-text-display">{{ content.content }}</pre>
          <button class="btn btn-primary share-copy-btn" @click="copyContent" style="text-align:center">
            {{ contentCopied ? '已复制' : '复制文本' }}
          </button>
        </div>

        <!-- File Share -->
        <div v-else-if="content?.type === 'file'" class="share-content-file">
          <img
            v-if="shareInfo?.mimetype?.startsWith('image/')"
            :src="filePreviewSrc"
            :alt="content.filename || ''"
            class="share-file-preview"
          />
          <div v-else class="share-file-icon">📄</div>
          <div class="share-file-info">
            <div class="share-file-name">{{ content.filename }}</div>
            <div class="share-file-meta">{{ content.mimetype }} · {{ formatSize(content.size || 0) }}</div>
          </div>
          <a :href="downloadLink" class="btn btn-primary share-copy-btn share-download-link" download style="text-align:center">
            下载文件
          </a>
        </div>
      </div>

      <div class="share-page-footer">
        Powered by <strong>ShareFlow</strong>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useApi, type ShareInfo, type ShareContent } from '../composables/useApi'

const route = useRoute()
const { getShareInfo, verifySharePassword, getShareContent, getShareDownloadUrl } = useApi()

const loading = ref(true)
const error = ref('')
const needPassword = ref(false)
const passwordInput = ref('')
const passwordError = ref(false)
const verifying = ref(false)
const contentCopied = ref(false)

const shareInfo = ref<ShareInfo | null>(null)
const content = ref<ShareContent | null>(null)
const sharePassword = ref('')

const shareId = computed(() => route.params.id as string)

const downloadLink = computed(() =>
  getShareDownloadUrl(shareId.value, sharePassword.value || undefined)
)

const filePreviewSrc = computed(() =>
  getShareDownloadUrl(shareId.value, sharePassword.value || undefined)
)

function formatExpiry(ts: number): string {
  const diff = ts - Math.floor(Date.now() / 1000)
  if (diff <= 0) return '已过期'
  if (diff < 60) return `${diff} 秒后过期`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟后过期`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时后过期`
  return `${Math.floor(diff / 86400)} 天后过期`
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1048576).toFixed(1)} MB`
}

async function loadShare() {
  try {
    const info = await getShareInfo(shareId.value)
    shareInfo.value = info

    if (info.has_password) {
      needPassword.value = true
      loading.value = false
      return
    }

    const data = await getShareContent(shareId.value)
    content.value = data
  } catch (e: any) {
    error.value = e.message || '分享不存在'
  } finally {
    loading.value = false
  }
}

async function handlePasswordSubmit() {
  verifying.value = true
  passwordError.value = false
  try {
    const ok = await verifySharePassword(shareId.value, passwordInput.value)
    if (ok) {
      sharePassword.value = passwordInput.value
      needPassword.value = false
      const data = await getShareContent(shareId.value, passwordInput.value)
      content.value = data
    } else {
      passwordError.value = true
    }
  } catch {
    passwordError.value = true
  } finally {
    verifying.value = false
  }
}

async function copyContent() {
  if (!content.value?.content) return
  try {
    await navigator.clipboard.writeText(content.value.content)
    contentCopied.value = true
    setTimeout(() => (contentCopied.value = false), 2000)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = content.value.content
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    contentCopied.value = true
    setTimeout(() => (contentCopied.value = false), 2000)
  }
}

onMounted(() => loadShare())
</script>
