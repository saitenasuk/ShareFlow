<template>
  <div class="text-input-section">
    <div class="text-input-wrapper">
      <textarea
        class="text-input"
        v-model="text"
        placeholder="在此输入文本..."
        :maxlength="maxLength"
        @input="onInput"
      ></textarea>
    </div>
    <div class="text-input-footer">
      <div class="action-bar">
        <button
          class="btn btn-primary"
          @click="handleSubmit"
          :disabled="!text.trim() || submitting"
        >
          <span v-if="submitting" class="spinner"></span>
          {{ submitting ? '发布中...' : '发布' }}
        </button>
        <button class="btn btn-secondary" @click="text = ''" :disabled="!text">
          清空
        </button>
      </div>
      <span
        class="char-counter"
        :class="{ warning: charPercent > 80, error: charPercent > 95 }"
      >
        {{ text.length.toLocaleString() }} / {{ maxLength.toLocaleString() }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  maxLength: number
}>()

const emit = defineEmits<{
  submit: [content: string]
}>()

const text = ref('')
const submitting = ref(false)

const charPercent = computed(() => (text.value.length / props.maxLength) * 100)

function onInput() {
  if (text.value.length > props.maxLength) {
    text.value = text.value.slice(0, props.maxLength)
  }
}

async function handleSubmit() {
  if (!text.value.trim() || submitting.value) return
  submitting.value = true
  try {
    emit('submit', text.value)
    text.value = ''
  } finally {
    submitting.value = false
  }
}

defineExpose({ text })
</script>
