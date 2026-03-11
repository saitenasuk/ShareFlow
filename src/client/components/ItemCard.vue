<template>
  <div class="item-card">
    <div class="item-card-header">
      <div class="item-card-meta">
        <span class="item-type-badge" :class="item.type">
          {{ item.type === 'text' ? '📝 TEXT' : '📎 FILE' }}
        </span>
        <span class="item-time">{{ formattedTime }}</span>
      </div>
      <div class="item-card-actions">
        <!-- Text: copy -->
        <button
          v-if="item.type === 'text'"
          class="btn-icon"
          @click="copyText"
          :title="copied ? '已复制!' : '复制'"
        >
          {{ copied ? '✅' : '📋' }}
        </button>

        <!-- File: download -->
        <a
          v-if="item.type === 'file'"
          :href="downloadUrl"
          class="btn-icon"
          download
          title="下载"
          @click.stop
        >
          ⬇️
        </a>

        <!-- Preview -->
        <button class="btn-icon" @click="$emit('preview', item)" title="预览">
          👁️
        </button>

        <!-- Share -->
        <button class="btn-icon" @click="openShareDialog" title="分享">
          🔗
        </button>

        <!-- Delete -->
        <button class="btn-icon danger" @click="confirmDelete" title="删除">
          🗑️
        </button>
      </div>
    </div>

    <!-- Text Content (fixed height) -->
    <div v-if="item.type === 'text'" class="item-text-content">
      <div class="item-text-raw">{{ item.content }}</div>
    </div>

    <!-- File Content -->
    <div v-else class="item-file-content">
      <img
        v-if="isImage"
        :src="previewUrl"
        :alt="item.filename || 'file'"
        class="file-thumb"
        loading="lazy"
      />
      <div v-else class="file-thumb file-thumb-icon">
        {{ fileIcon }}
      </div>
      <div class="file-info">
        <div class="file-name">{{ item.filename }}</div>
        <div class="file-meta">{{ formattedSize }} · {{ item.mimetype }}</div>
      </div>
    </div>

    <!-- Mobile action bar -->
    <div class="item-card-actions-mobile">
      <a
        v-if="item.type === 'file'"
        :href="downloadUrl"
        class="btn-mobile-action primary"
        download
        @click.stop
      >⬇️ 下载</a>
      <button
        v-else
        class="btn-mobile-action primary"
        @click="copyText"
      >{{ copied ? '✅ 已复制' : '📋 复制' }}</button>
      <button class="btn-mobile-action" @click="$emit('preview', item)">👁️ 查看</button>
      <button class="btn-mobile-action" @click="openShareDialog">🔗 分享</button>
      <button class="btn-mobile-action danger" @click="confirmDelete">🗑️</button>
    </div>

    <!-- Delete confirmation overlay -->
    <Transition name="confirm-fade">
      <div v-if="showDeleteConfirm" class="confirm-overlay" @click.self="showDeleteConfirm = false">
        <div class="confirm-box">
          <p>确定要删除这条内容吗？</p>
          <div class="confirm-actions">
            <button class="btn btn-secondary btn-sm" @click="showDeleteConfirm = false">取消</button>
            <button class="btn btn-danger btn-sm" @click="doDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Share dialog (Teleport to body) -->
    <Teleport to="body">
      <Transition name="confirm-fade">
        <div v-if="showShareDialog" class="preview-overlay" @click.self="showShareDialog = false">
          <div class="share-dialog">
            <div class="share-dialog-header">
              <span>🔗 分享设置</span>
              <button class="btn-icon" @click="showShareDialog = false">✕</button>
            </div>
            <div class="share-dialog-body">
              <!-- Expiry: custom dropdown -->
              <div class="share-field">
                <label>⏳ 过期时间</label>
                <div class="custom-select" @click.stop="showExpiryMenu = !showExpiryMenu" tabindex="0" @blur="showExpiryMenu = false">
                  <span class="custom-select-text">{{ expiryLabel }}</span>
                  <span class="custom-select-arrow">▾</span>
                  <div v-if="showExpiryMenu" class="custom-select-menu">
                    <div
                      v-for="opt in expiryOptions" :key="opt.value"
                      class="custom-select-option"
                      :class="{ active: shareOpts.expiresIn === opt.value }"
                      @click.stop="shareOpts.expiresIn = opt.value; showExpiryMenu = false"
                    >{{ opt.label }}</div>
                  </div>
                </div>
              </div>
              <!-- Auto delete item -->
              <div class="share-field share-field-inline" v-if="shareOpts.expiresIn">
                <label class="share-checkbox-label">
                  <input type="checkbox" v-model="shareOpts.autoDeleteItem" class="share-checkbox" />
                  🗑️ 过期后自动删除原记录
                </label>
              </div>
              <!-- View limit -->
              <div class="share-field">
                <label>👁️ 限制查看次数</label>
                <input
                  v-model.number="shareOpts.maxViews"
                  type="number"
                  min="1"
                  placeholder="不限制"
                  class="share-input"
                />
              </div>
              <!-- Password -->
              <div class="share-field">
                <label>🔒 访问密码</label>
                <input
                  v-model="shareOpts.password"
                  type="text"
                  placeholder="留空 = 无需密码"
                  class="share-input"
                />
              </div>
              <!-- Note -->
              <div class="share-field">
                <label>📝 备注</label>
                <input
                  v-model="shareOpts.note"
                  type="text"
                  placeholder="添加备注..."
                  class="share-input"
                />
              </div>
            </div>
            <div class="share-dialog-footer">
              <button class="btn btn-secondary btn-sm" @click="showShareDialog = false">取消</button>
              <button class="btn btn-primary btn-sm" @click="doShare" :disabled="shareLoading">
                {{ shareLoading ? '创建中...' : '确认分享' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import type { Item } from '../composables/useApi'
import { useApi } from '../composables/useApi'

const props = defineProps<{
  item: Item
}>()

const emit = defineEmits<{
  delete: [id: string, type: 'text' | 'file']
  preview: [item: Item]
  toast: [message: string, type: 'success' | 'error']
  shared: []
}>()

const { getFileUrl, getPreviewUrl, createShare } = useApi()
const copied = ref(false)
const showDeleteConfirm = ref(false)
const showShareDialog = ref(false)
const shareLoading = ref(false)
const showExpiryMenu = ref(false)

const shareOpts = reactive({
  expiresIn: '' as string,
  maxViews: null as number | null,
  password: '',
  note: '',
  autoDeleteItem: false,
})

const expiryOptions = [
  { value: '', label: '不过期' },
  { value: '300', label: '5 分钟' },
  { value: '1800', label: '30 分钟' },
  { value: '3600', label: '1 小时' },
  { value: '86400', label: '1 天' },
  { value: '604800', label: '7 天' },
  { value: '2592000', label: '30 天' },
]

const expiryLabel = computed(() => {
  const found = expiryOptions.find(o => o.value === shareOpts.expiresIn)
  return found ? found.label : '不过期'
})

const isImage = computed(() =>
  props.item.mimetype?.startsWith('image/')
)

const previewUrl = computed(() => getPreviewUrl(props.item.id))
const downloadUrl = computed(() => getFileUrl(props.item.id))

const fileIcon = computed(() => {
  const mime = props.item.mimetype || ''
  if (mime.startsWith('video/')) return '🎬'
  if (mime.startsWith('audio/')) return '🎵'
  if (mime.includes('pdf')) return '📄'
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return '📦'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  return '📄'
})

const formattedTime = computed(() => {
  const date = new Date(props.item.created_at * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
})

const formattedSize = computed(() => {
  const size = props.item.size || 0
  if (size < 1024) return `${size} B`
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1048576).toFixed(1)} MB`
})

function confirmDelete() {
  showDeleteConfirm.value = true
}

function doDelete() {
  showDeleteConfirm.value = false
  emit('delete', props.item.id, props.item.type)
}

function openShareDialog() {
  shareOpts.expiresIn = ''
  shareOpts.maxViews = null
  shareOpts.password = ''
  shareOpts.note = ''
  shareOpts.autoDeleteItem = false
  showExpiryMenu.value = false
  showShareDialog.value = true
}

async function doShare() {
  shareLoading.value = true
  try {
    const result = await createShare({
      item_id: props.item.id,
      password: shareOpts.password || undefined,
      max_views: shareOpts.maxViews || undefined,
      expires_in: shareOpts.expiresIn ? parseInt(shareOpts.expiresIn) : undefined,
      note: shareOpts.note || undefined,
      auto_delete_item: shareOpts.autoDeleteItem,
    })

    // Copy share URL
    const shareUrl = `${window.location.origin}/s/${result.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = shareUrl
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }

    showShareDialog.value = false
    emit('toast', '✅ 分享链接已复制到剪切板', 'success')
    emit('shared')
  } catch (e: any) {
    emit('toast', `❌ ${e.message}`, 'error')
  } finally {
    shareLoading.value = false
  }
}

async function copyText() {
  if (!props.item.content) return
  try {
    await navigator.clipboard.writeText(props.item.content)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = props.item.content
    textarea.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
}
</script>
