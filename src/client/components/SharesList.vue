<template>
  <div class="clip-list">
    <div class="clip-list-header">
      <div class="clip-list-title">
        <h2>🔗 分享列表</h2>
        <span class="clip-list-count" v-if="shares.length">{{ shares.length }} 条</span>
      </div>
      <button v-if="shares.length" class="btn btn-ghost-danger btn-sm" @click="handleClearAll">
        清空列表
      </button>
    </div>

    <div v-if="loading" class="clip-list-empty"><span class="spinner"></span> 加载中...</div>
    <div v-else-if="!shares.length" class="clip-list-empty">还没有分享，点击剪切板项的 🔗 按钮创建分享</div>

    <div v-else class="clip-list-items">
      <div
        v-for="s in shares"
        :key="s.id"
        class="clip-card share-list-card"
      >
        <div class="clip-card-header">
          <div class="clip-card-meta">
            <span class="clip-type-badge" :class="s.clip_type || 'text'">
              {{ s.clip_type === 'file' ? '📎 FILE' : '📝 TEXT' }}
            </span>
            <span class="clip-time">{{ formattedTime(s.created_at) }}</span>
          </div>
          <div class="clip-card-actions">
            <button class="btn-icon" @click="copyShareLink(s)" :title="copiedId === s.id ? '已复制!' : '复制链接'">
              {{ copiedId === s.id ? '✅' : '📋' }}
            </button>
            <button class="btn-icon danger" @click="confirmDeleteShare(s)" title="删除分享">🗑️</button>
          </div>
        </div>

        <div>
          <div v-if="s.clip_type === 'file'" class="share-list-filename">📎 {{ s.clip_filename }}</div>
          <div v-else-if="s.clip_preview" class="share-list-filename">📝 {{ s.clip_preview }}{{ s.clip_preview && s.clip_preview.length >= 50 ? '...' : '' }}</div>
          <div class="share-list-meta">
            <span v-if="s.password">🔒 有密码</span>
            <span v-if="s.max_views !== null">👁️ {{ s.views }}/{{ s.max_views }}</span>
            <span v-if="s.expires_at">⏳ {{ formatExpiry(s.expires_at) }}</span>
            <span v-if="s.auto_delete_clip">🗑️ 到期删源</span>
            <span v-if="s.note" class="share-list-note">📝 {{ s.note }}</span>
          </div>
        </div>

        <!-- Mobile action bar -->
        <div class="clip-card-actions-mobile">
          <button class="btn-mobile-action primary" @click="copyShareLink(s)">
            {{ copiedId === s.id ? '✅ 已复制' : '📋 复制链接' }}
          </button>
          <button class="btn-mobile-action danger" @click="confirmDeleteShare(s)">🗑️</button>
        </div>

        <!-- Delete confirmation -->
        <Transition name="confirm-fade">
          <div v-if="deleteConfirmId === s.id" class="confirm-overlay" @click.self="deleteConfirmId = ''">
            <div class="confirm-box">
              <p>确定要删除这个分享吗？</p>
              <div class="confirm-actions">
                <button class="btn btn-secondary btn-sm" @click="deleteConfirmId = ''">取消</button>
                <button class="btn btn-danger btn-sm" @click="doDeleteShare(s.id)">确认删除</button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Clear All confirmation overlay -->
    <Teleport to="body">
      <Transition name="confirm-fade">
        <div v-if="showClearAllConfirm" class="confirm-fullscreen" @click.self="showClearAllConfirm = false">
          <div class="confirm-dialog">
            <p>⚠️ 确定要清空所有分享吗？</p>
            <p style="font-size: 0.8rem; color: var(--text-muted)">此操作不可撤销</p>
            <div class="confirm-actions">
              <button class="btn btn-secondary btn-sm" @click="showClearAllConfirm = false">取消</button>
              <button class="btn btn-danger btn-sm" @click="doClearAll">确认清空</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useApi, type ShareListItem } from '../composables/useApi'

const emit = defineEmits<{
  toast: [message: string, type: 'success' | 'error']
}>()

const { listShares, deleteShareById, deleteAllShares } = useApi()

const shares = ref<ShareListItem[]>([])
const loading = ref(true)
const copiedId = ref('')
const deleteConfirmId = ref('')
const showClearAllConfirm = ref(false)

let refreshTimer: ReturnType<typeof setInterval>

async function loadShares() {
  try {
    shares.value = await listShares()
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

function formattedTime(ts: number): string {
  const date = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatExpiry(ts: number): string {
  const diff = ts - Math.floor(Date.now() / 1000)
  if (diff <= 0) return '已过期'
  if (diff < 60) return `${diff}秒后`
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟后`
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时后`
  return `${Math.floor(diff / 86400)}天后`
}

async function copyShareLink(s: ShareListItem) {
  const url = `${window.location.origin}/s/${s.id}`
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copiedId.value = s.id
  setTimeout(() => (copiedId.value = ''), 2000)
}

function confirmDeleteShare(s: ShareListItem) {
  deleteConfirmId.value = s.id
}

async function doDeleteShare(id: string) {
  deleteConfirmId.value = ''
  try {
    await deleteShareById(id)
    shares.value = shares.value.filter((s) => s.id !== id)
    emit('toast', '✅ 分享已删除', 'success')
  } catch {
    emit('toast', '❌ 删除失败', 'error')
  }
}

function handleClearAll() {
  showClearAllConfirm.value = true
}

async function doClearAll() {
  showClearAllConfirm.value = false
  try {
    await deleteAllShares()
    shares.value = []
    emit('toast', '✅ 所有分享已清空', 'success')
  } catch {
    emit('toast', '❌ 清空失败', 'error')
  }
}

defineExpose({ loadShares })

onMounted(() => {
  loadShares()
  refreshTimer = setInterval(loadShares, 10000)
})

onUnmounted(() => {
  clearInterval(refreshTimer)
})
</script>
