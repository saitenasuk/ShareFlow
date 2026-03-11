<template>
  <div class="item-list">
    <div class="item-list-header">
      <div class="item-list-title">
        <h2>📋 记录列表</h2>
        <span class="item-list-count" v-if="items.length">{{ items.length }} 条</span>
      </div>
      <button v-if="items.length" class="btn btn-ghost-danger btn-sm" @click="handleClearAll">
        清空列表
      </button>
    </div>

    <div v-if="loading" class="item-list-empty"><span class="spinner"></span> 加载中...</div>
    <div v-else-if="!items.length" class="item-list-empty">还没有内容，发送文本或上传文件开始使用吧</div>

    <template v-else>
      <div class="item-list-items">
        <ItemCard
          v-for="item in items"
          :key="item.id"
          :item="item"
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
            <p>⚠️ 确定要清空所有记录吗？</p>
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
import ItemCard from './ItemCard.vue'
import { useApi, type Item } from '../composables/useApi'

const emit = defineEmits<{
  toast: [message: string, type: 'success' | 'error']
  preview: [item: Item]
  shared: []
}>()

const { fetchItems, deleteItem, clearAll } = useApi()

const items = ref<Item[]>([])
const loading = ref(true)
const showClearAllConfirm = ref(false)

let refreshTimer: ReturnType<typeof setInterval>

async function loadItems() {
  try {
    const data = await fetchItems()
    items.value = data.items || []
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

async function handleDelete(id: string, type: 'text' | 'file') {
  try {
    await deleteItem(id, type)
    items.value = items.value.filter((c) => c.id !== id)
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
    items.value = []
    emit('toast', `✅ 已清空 ${count} 条`, 'success')
  } catch {
    emit('toast', '❌ 清空失败', 'error')
  }
}

defineExpose({ loadItems })

onMounted(() => {
  loadItems()
  refreshTimer = setInterval(loadItems, 5000)
})

onUnmounted(() => {
  clearInterval(refreshTimer)
})
</script>
