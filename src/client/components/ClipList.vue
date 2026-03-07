<template>
  <div class="clip-list">
    <div class="clip-list-header">
      <div class="clip-list-title">
        <h2>📋 剪切板列表</h2>
        <span class="clip-list-count" v-if="clips.length">{{ clips.length }} 条</span>
      </div>
      <button v-if="clips.length" class="btn btn-ghost-danger btn-sm" @click="handleClearAll">
        清空列表
      </button>
    </div>

    <div v-if="loading" class="clip-list-empty"><span class="spinner"></span> 加载中...</div>
    <div v-else-if="!clips.length" class="clip-list-empty">还没有内容，发送文本或上传文件开始使用吧</div>

    <template v-else>
      <div class="clip-list-items">
        <ClipCard
          v-for="clip in clips"
          :key="clip.id"
          :clip="clip"
          @delete="handleDelete"
          @preview="(c) => emit('preview', c)"
          @toast="(msg, type) => emit('toast', msg, type)"
          @shared="() => emit('shared')"
        />
      </div>
    </template>

    <!-- Clear All confirmation overlay -->
    <Teleport to="body">
      <Transition name="confirm-fade">
        <div v-if="showClearAllConfirm" class="confirm-fullscreen" @click.self="showClearAllConfirm = false">
          <div class="confirm-dialog">
            <p>⚠️ 确定要清空所有剪切板内容吗？</p>
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
import ClipCard from './ClipCard.vue'
import { useApi, type Clip } from '../composables/useApi'

const emit = defineEmits<{
  toast: [message: string, type: 'success' | 'error']
  preview: [clip: Clip]
  shared: []
}>()

const { fetchClips, deleteClip, clearAll } = useApi()

const clips = ref<Clip[]>([])
const loading = ref(true)
const showClearAllConfirm = ref(false)

let refreshTimer: ReturnType<typeof setInterval>

async function loadClips() {
  try {
    const data = await fetchClips()
    clips.value = data.items || []
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

async function handleDelete(id: string, type: 'text' | 'file') {
  try {
    await deleteClip(id, type)
    clips.value = clips.value.filter((c) => c.id !== id)
    emit('toast', '✅ 已删除', 'success')
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
    const count = await clearAll()
    clips.value = []
    emit('toast', `✅ 已清空 ${count} 条`, 'success')
  } catch {
    emit('toast', '❌ 清空失败', 'error')
  }
}

defineExpose({ loadClips })

onMounted(() => {
  loadClips()
  refreshTimer = setInterval(loadClips, 5000)
})

onUnmounted(() => {
  clearInterval(refreshTimer)
})
</script>
