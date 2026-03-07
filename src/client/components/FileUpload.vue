<template>
  <div class="file-upload-section">
    <div
      class="upload-zone"
      :class="{ 'drag-over': isDragging, 'has-file': !!stagedFile }"
      @click="!stagedFile && triggerFileInput()"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <input
        ref="fileInput"
        type="file"
        hidden
        @change="onFileSelect"
      />

      <!-- Empty state -->
      <template v-if="!stagedFile && !uploading">
        <div class="upload-zone-icon">📁</div>
        <div class="upload-zone-text">
          点击选择、拖拽或 <strong>Ctrl+V</strong> 粘贴
        </div>
        <div class="upload-zone-hint">最大 {{ maxFileSizeMB }}MB</div>
      </template>

      <!-- Staged file preview -->
      <template v-else-if="stagedFile && !uploading">
        <div class="staged-inline">
          <img v-if="stagedFile.previewUrl" :src="stagedFile.previewUrl" class="staged-inline-thumb" alt="" />
          <div v-else class="staged-inline-thumb staged-inline-icon">{{ stagedFile.icon }}</div>
          <div class="staged-inline-info">
            <div class="staged-file-name">{{ stagedFile.file.name }}</div>
            <div class="staged-file-meta">{{ formatSize(stagedFile.file.size) }}</div>
          </div>
        </div>
        <div class="staged-inline-actions">
          <button class="btn btn-primary btn-sm" @click.stop="confirmUpload">上传</button>
          <button class="btn btn-secondary btn-sm" @click.stop="cancelStaged">取消</button>
        </div>
      </template>

      <!-- Upload in progress -->
      <template v-else-if="uploading">
        <div class="progress-container" style="width: 100%">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: uploadProgress.percent + '%' }"></div>
          </div>
          <div class="progress-text">
            <span>{{ stagedFile?.file.name }}</span>
            <span>{{ uploadProgress.percent }}%</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Error -->
    <div v-if="errorMsg" class="upload-error" style="color: var(--error); font-size: 0.85rem; margin-top: 8px;">
      ⚠️ {{ errorMsg }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { UploadProgress } from '../composables/useApi'

const props = defineProps<{
  maxFileSize: number
}>()

const emit = defineEmits<{
  upload: [file: File]
}>()

interface StagedFile {
  file: File
  previewUrl: string | null
  icon: string
}

const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const stagedFile = ref<StagedFile | null>(null)
const uploading = ref(false)
const uploadProgress = ref<UploadProgress>({ loaded: 0, total: 0, percent: 0 })
const errorMsg = ref('')

const maxFileSizeMB = computed(() => (props.maxFileSize / 1024 / 1024).toFixed(0))

function triggerFileInput() {
  fileInput.value?.click()
}

function validateFile(file: File): boolean {
  if (file.size > props.maxFileSize) {
    errorMsg.value = `文件 "${file.name}" 超过 ${maxFileSizeMB.value}MB 限制`
    setTimeout(() => (errorMsg.value = ''), 5000)
    return false
  }
  return true
}

function getFileIcon(mime: string): string {
  if (mime.startsWith('video/')) return '🎬'
  if (mime.startsWith('audio/')) return '🎵'
  if (mime.includes('pdf')) return '📄'
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return '📦'
  return '📄'
}

function stageFile(file: File) {
  errorMsg.value = ''
  if (!validateFile(file)) return
  // Replace any existing staged file
  if (stagedFile.value?.previewUrl) URL.revokeObjectURL(stagedFile.value.previewUrl)
  let previewUrl: string | null = null
  if (file.type.startsWith('image/')) {
    previewUrl = URL.createObjectURL(file)
  }
  stagedFile.value = { file, previewUrl, icon: getFileIcon(file.type) }
}

function cancelStaged() {
  if (stagedFile.value?.previewUrl) URL.revokeObjectURL(stagedFile.value.previewUrl)
  stagedFile.value = null
}

function confirmUpload() {
  if (!stagedFile.value) return
  emit('upload', stagedFile.value.file)
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1048576).toFixed(1)} MB`
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    stageFile(input.files[0])
    input.value = ''
  }
}

function onDragOver() { isDragging.value = true }
function onDragLeave() { isDragging.value = false }

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    stageFile(e.dataTransfer.files[0])
  }
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) { stageFile(file); break }
    }
  }
}

onMounted(() => { document.addEventListener('paste', onPaste) })
onUnmounted(() => { document.removeEventListener('paste', onPaste) })

// Expose for parent to manage upload state
function setUploading(val: boolean) { uploading.value = val }
function setProgress(p: UploadProgress) { uploadProgress.value = p }
function reset() {
  cancelStaged()
  uploading.value = false
  uploadProgress.value = { loaded: 0, total: 0, percent: 0 }
}

defineExpose({ setUploading, setProgress, reset })
</script>
