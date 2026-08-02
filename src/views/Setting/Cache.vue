<script lang="ts" setup>
import ActionButton from '@/components/ActionButton.vue'
import Modal from '@/components/Modal.vue'
import { notify } from '@/components/Notification.vue'
import { invoke } from '@/utils/tools'

interface CacheOption {
  label: string
  value: string
}

const cacheOptions = ref<CacheOption[]>([
  { label: '音频', value: '' },
  { label: '歌词', value: '' },
  { label: '本地封面', value: '' }
])

const clearOption = ref<CacheOption>()
const clearVisible = ref(false)
const clearUserVisible = ref(false)

const getPaths = async () => {
  try {
    const path_all = await invoke('system_path_all')
    if (!path_all) return

    cacheOptions.value.forEach((option) => {
      if (option.label === '音频') {
        option.value = path_all.temp
      } else if (option.label === '歌词') {
        option.value = path_all.lyric
      } else if (option.label === '本地封面') {
        option.value = path_all.cover
      }
    })
  } catch (error) {
    console.error(error)
  }
}

const clearUserCache = async () => {
  clearUserVisible.value = true
}

const setPath = (option: CacheOption) => {
  console.log(option)
}

const openPath = async (option: CacheOption) => {
  try {
    await invoke('system_path_dir_open', { path: option.value })
  } catch (error) {
    console.error(error)
  }
}

const clearCache = (option: CacheOption) => {
  clearOption.value = option
  clearVisible.value = true
}

const handleClearUserConfirm = async () => {
  try {
    await invoke('http_config_clear')

    handleClearUserCancel()
    notify.success('清理成功')
  } catch (error) {
    console.error(error)
  }
}

const handleClearUserCancel = () => {
  clearUserVisible.value = false
}

const handleClearConfirm = async () => {
  if (!clearOption.value) return

  try {
    await invoke('system_path_dir_clear', { dirPath: clearOption.value.value })

    handleClearCancel()
    notify.success('清理成功')
  } catch (error) {
    console.error(error)
  }
}

const handleClearCancel = () => {
  clearOption.value = undefined
  clearVisible.value = false
}

onMounted(() => {
  getPaths()
})
</script>

<template>
  <div class="flex text-base">
    <div class="font-bold w-40">缓存:</div>

    <div class="space-y-3 flex-1">
      <div class="flex items-center gap-3">
        <div class="w-20">用户配置</div>
        <ActionButton theme="error" @click="clearUserCache">清理</ActionButton>
      </div>

      <div v-for="(option, index) in cacheOptions" :key="index" class="flex items-center gap-3">
        <div class="w-20">{{ option.label }}</div>
        <input class="card flex-1 px-2 py-1" :value="option.value" readonly />
        <ActionButton theme="success" @click="setPath(option)" disabled>设置</ActionButton>
        <ActionButton theme="success" @click="openPath(option)">打开</ActionButton>
        <ActionButton theme="error" @click="clearCache(option)">清理</ActionButton>
      </div>
    </div>
  </div>

  <Modal
    v-model="clearUserVisible"
    class="w-80"
    title="清空缓存"
    @confirm="handleClearUserConfirm"
    @cancel="handleClearUserCancel">
    <div class="px-4">
      <span>确认清空</span>
      <span class="font-bold px-1">用户</span>
      <span>缓存?</span>
    </div>
  </Modal>

  <Modal
    v-model="clearVisible"
    class="w-80"
    title="清空缓存"
    @confirm="handleClearConfirm"
    @cancel="handleClearCancel">
    <div class="px-4">
      <span>确认清空</span>
      <span class="font-bold px-1">{{ clearOption?.label || '' }}</span>
      <span>缓存?</span>
    </div>

    <div v-if="clearOption?.label === '本地封面'" class="px-4 mt-2 text-warning">
      tips: 不建议清除本地封面缓存
    </div>
  </Modal>
</template>
