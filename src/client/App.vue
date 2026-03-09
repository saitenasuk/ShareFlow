<template>
  <!-- Initializing: show nothing until auth check is done -->
  <div v-if="initializing" class="login-container">
    <div class="share-page-center"><span class="spinner"></span></div>
  </div>

  <div v-else-if="showLogin" class="login-container">
    <div class="login-card glass-card">
      <h1 class="login-title"><img src="/icons/logo.png" alt="ShareFlow" class="logo-img" /> ShareFlow</h1>
      <p class="login-subtitle">请输入密码以访问</p>
      <form @submit.prevent="handleLogin" class="login-form">
        <input
          v-model="loginPassword"
          type="password"
          placeholder="输入密码..."
          class="login-input"
          autofocus
        />
        <button type="submit" class="btn btn-primary login-btn" :disabled="loginLoading" style="text-align:center">
          {{ loginLoading ? '验证中...' : '进入' }}
        </button>
        <p v-if="loginError" class="login-error" style="position:absolute;bottom:-28px;left:0;right:0">{{ loginError }}</p>
      </form>
    </div>
  </div>

  <div v-else class="app-container">
    <header class="app-header">
      <h1><img src="/icons/logo.png" alt="ShareFlow" class="logo-img" /> <span class="header-text">ShareFlow</span></h1>
      <div class="header-tabs">
        <button class="header-tab" :class="{ active: activeTab === 'clips' }" @click="activeTab = 'clips'">
          📋 <span class="header-text">剪切板</span>
        </button>
        <button class="header-tab" :class="{ active: activeTab === 'shares' }" @click="activeTab = 'shares'">
          🔗 <span class="header-text">分享</span>
        </button>
      </div>
    </header>

    <!-- Desktop: Two-column layout -->
    <div class="app-layout">
      <aside class="left-panel">
        <h2 class="section-title">📝 发送文本</h2>
        <div class="panel-section glass-card panel-text-card">
          <TextInput
            ref="textInputRef"
            :max-length="config.maxTextLength"
            @submit="handleTextSubmit"
          />
        </div>
        <h2 class="section-title">📁 上传文件</h2>
        <div class="panel-section glass-card">
          <FileUpload
            ref="fileUploadRef"
            :max-file-size="config.maxFileSize"
            @upload="handleFileUpload"
          />
        </div>
      </aside>

      <main class="right-panel" @touchstart="onTouchStart" @touchend="onTouchEnd">
        <ClipList
          v-show="activeTab === 'clips'"
          ref="clipListRef"
          @toast="showToast"
          @preview="openPreview"
          @shared="handleShared"
        />
        <SharesList
          v-show="activeTab === 'shares'"
          ref="sharesListRef"
          @toast="showToast"
        />
      </main>
    </div>

    <!-- Mobile: FAB + Bottom Sheet -->
    <button class="fab" @click="showMobileSheet = true" v-if="!showMobileSheet">
      ＋
    </button>

    <Teleport to="body">
      <!-- Mobile bottom sheet overlay -->
      <div v-if="showMobileSheet" class="sheet-overlay" @click.self="showMobileSheet = false">
        <div class="sheet-content">
          <div class="sheet-header">
            <span>新建内容</span>
            <button class="btn-icon" @click="showMobileSheet = false">✕</button>
          </div>
          <div class="sheet-tabs">
            <button
              class="tab-btn"
              :class="{ active: mobileTab === 'text' }"
              @click="mobileTab = 'text'"
            >📝 文本</button>
            <button
              class="tab-btn"
              :class="{ active: mobileTab === 'file' }"
              @click="mobileTab = 'file'"
            >📁 文件</button>
          </div>
          <div class="sheet-body">
            <TextInput
              v-show="mobileTab === 'text'"
              ref="mobileTextRef"
              :max-length="config.maxTextLength"
              @submit="handleMobileTextSubmit"
            />
            <FileUpload
              v-show="mobileTab === 'file'"
              ref="mobileFileRef"
              :max-file-size="config.maxFileSize"
              @upload="handleMobileFileUpload"
            />
          </div>
        </div>
      </div>

      <!-- Preview Modal -->
      <Transition name="confirm-fade">
        <div v-if="previewClip" class="preview-overlay" @click.self="previewClip = null">
          <div class="preview-modal">
            <div class="preview-modal-header">
              <span>{{ previewClip.type === 'text' ? '📝 文本预览' : '📎 文件预览' }}</span>
              <div class="preview-modal-header-actions">
                <button v-if="previewClip.type === 'text'" class="btn-icon" @click="copyPreviewText" :title="previewCopied ? '已复制!' : '复制'">
                  {{ previewCopied ? '✅' : '📋' }}
                </button>
                <a v-if="previewClip.type === 'file'" :href="getFileUrlForClip(previewClip.id)" class="btn-icon" download title="下载">
                  ⬇️
                </a>
                <button class="btn-icon" @click="previewClip = null">✕</button>
              </div>
            </div>
            <div class="preview-modal-body">
              <template v-if="previewClip.type === 'text'">
                <pre class="preview-text-raw">{{ previewClip.content }}</pre>
              </template>
              <template v-else>
                <img
                  v-if="previewClip.mimetype?.startsWith('image/')"
                  :src="getPreviewUrlForClip(previewClip.id)"
                  :alt="previewClip.filename || ''"
                  class="preview-image"
                />
                <div v-else class="preview-file-info">
                  <div style="font-size: 3rem; margin-bottom: 12px">📄</div>
                  <div style="font-weight: 600">{{ previewClip.filename }}</div>
                  <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 4px">
                    {{ previewClip.mimetype }}
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Toasts -->
      <div
        v-for="(toast, idx) in toasts"
        :key="idx"
        class="toast"
        :class="toast.type"
        :style="{ bottom: (24 + idx * 56) + 'px' }"
      >
        {{ toast.message }}
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import TextInput from './components/TextInput.vue'
import FileUpload from './components/FileUpload.vue'
import ClipList from './components/ClipList.vue'
import SharesList from './components/SharesList.vue'
import { useApi, type AppConfigData, type Clip } from './composables/useApi'

const { fetchConfig, login, checkAuth, createTextClip, uploadFile, getPreviewUrl, getFileUrl } = useApi()

const textInputRef = ref<InstanceType<typeof TextInput> | null>(null)
const fileUploadRef = ref<InstanceType<typeof FileUpload> | null>(null)
const mobileTextRef = ref<InstanceType<typeof TextInput> | null>(null)
const mobileFileRef = ref<InstanceType<typeof FileUpload> | null>(null)
const clipListRef = ref<InstanceType<typeof ClipList> | null>(null)
const sharesListRef = ref<InstanceType<typeof SharesList> | null>(null)

const initializing = ref(true)
const showLogin = ref(false)
const loginPassword = ref('')
const loginLoading = ref(false)
const loginError = ref('')

const showMobileSheet = ref(false)
const mobileTab = ref<'text' | 'file'>('text')
const previewClip = ref<Clip | null>(null)
const previewCopied = ref(false)
const activeTab = ref<'clips' | 'shares'>('clips')

const config = reactive<AppConfigData>({
  maxFileSize: 10485760,
  maxTextLength: 100000,
  hasPassword: false,
})

interface Toast {
  message: string
  type: 'success' | 'error'
}
const toasts = ref<Toast[]>([])

function showToast(message: string, type: 'success' | 'error' = 'success') {
  toasts.value.push({ message, type })
  setTimeout(() => { toasts.value.shift() }, 3000)
}

function openPreview(clip: Clip) {
  previewClip.value = clip
}

function getPreviewUrlForClip(id: string): string {
  return getPreviewUrl(id)
}

function getFileUrlForClip(id: string): string {
  return getFileUrl(id)
}

async function copyPreviewText() {
  const text = previewClip.value?.content
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  previewCopied.value = true
  setTimeout(() => (previewCopied.value = false), 2000)
}

async function handleLogin() {
  loginLoading.value = true
  loginError.value = ''
  try {
    const ok = await login(loginPassword.value)
    if (ok) {
      showLogin.value = false
    } else {
      loginError.value = '密码错误'
    }
  } catch {
    loginError.value = '网络错误'
  } finally {
    loginLoading.value = false
  }
}

async function handleTextSubmit(content: string) {
  try {
    await createTextClip(content)
    showToast('✅ 文本已发送到剪切板')
    clipListRef.value?.loadClips()
  } catch (e: any) {
    showToast(`❌ ${e.message}`, 'error')
  }
}

async function doFileUpload(file: File, uploadRef: InstanceType<typeof FileUpload> | null) {
  if (!uploadRef) return
  uploadRef.setUploading(true)
  try {
    await uploadFile(file, (progress) => {
      uploadRef.setProgress(progress)
    })
    showToast(`✅ 文件 "${file.name}" 已上传`)
    clipListRef.value?.loadClips()
  } catch (e: any) {
    showToast(`❌ ${e.message}`, 'error')
  } finally {
    setTimeout(() => uploadRef.reset(), 800)
  }
}

async function handleFileUpload(file: File) {
  await doFileUpload(file, fileUploadRef.value)
}

// Swipe gesture for tab switching
let touchStartX = 0
let touchStartY = 0

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX
  const dy = e.changedTouches[0].clientY - touchStartY
  // Only trigger if horizontal swipe is dominant and > 50px
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) {
      activeTab.value = 'shares'
    } else {
      activeTab.value = 'clips'
    }
  }
}

function handleShared() {
  // Don't auto-switch — user stays on current tab
}

async function handleMobileTextSubmit(content: string) {
  await handleTextSubmit(content)
  showMobileSheet.value = false
}

async function handleMobileFileUpload(file: File) {
  await doFileUpload(file, mobileFileRef.value)
  showMobileSheet.value = false
}

onMounted(async () => {
  try {
    const cfg = await fetchConfig()
    Object.assign(config, cfg)

    if (config.hasPassword) {
      const authed = await checkAuth()
      if (!authed) {
        showLogin.value = true
      }
    }
  } catch {
    // Use defaults
  } finally {
    initializing.value = false
  }
})
</script>
