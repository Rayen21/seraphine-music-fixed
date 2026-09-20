<script lang="ts" setup>
import ActionButton from '@/components/ActionButton.vue'
import Modal from '@/components/Modal.vue'
import { notify } from '@/components/Notification.vue'
import { useUserStore } from '@/stores/user'
import { invoke } from '@/utils/tools'
import { open } from '@tauri-apps/plugin-dialog'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { onMounted, ref } from 'vue'

interface CacheOption {
  label: string
  value: string
}

const userStore = useUserStore()

const cacheOptions = ref<CacheOption[]>([
  { label: '音频', value: '' },
  { label: '歌词', value: '' },
  { label: '本地封面', value: '' }
])
const clearOption = ref<CacheOption>()
const clearVisible = ref(false)
const clearUserVisible = ref(false)
const setOption = ref<CacheOption>()
const setModalVisible = ref(false)

const getPaths = async () => {
  try {
    const path_all = await invoke<any>('system_path_all')
    if (!path_all) return

    cacheOptions.value.forEach((option) => {
      if (option.label === '音频') {
        option.value = path_all.custom_audio_dir || path_all.temp_dir
      } else if (option.label === '歌词') {
        option.value = path_all.custom_lyric_dir || path_all.lyric_dir
      } else if (option.label === '本地封面') {
        option.value = path_all.custom_cover_dir || path_all.cover_dir
      }
    })
  } catch (error) {
    console.error(error)
  }
}

const setPath = (option: CacheOption) => {
  setOption.value = { label: option.label, value: '' }
  setModalVisible.value = true
}

const handleSetPath = async () => {
  if (!setOption.value) return

  const nameMap: Record<string, string> = {
    '音频': 'audio',
    '歌词': 'lyric',
    '本地封面': 'cover'
  }

  try {
    await invoke<any>('system_path_set_custom_dir', {
      name: nameMap[setOption.value.label || ''] || '',
      dir: setOption.value.value
    })

    await getPaths()
    handleSetModalCancel()
    notify.success(`已设置${setOption.value.label}缓存路径`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    notify.error(`设置失败: ${msg}`)
  }
}

const openPath = async (option: CacheOption) => {
  try {
    await revealItemInDir(option.value)
  } catch (error) {
    console.error(error)
  }
}

const clearCache = (option: CacheOption) => {
  clearOption.value = option
  clearVisible.value = true
}

const clearUserCache = async () => {
  clearUserVisible.value = true
}

const handleClearUserConfirm = async () => {
  try {
    await userStore.logout()
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
    await invoke('system_path_clear', { dirPath: clearOption.value.value })

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

const handleSetModalCancel = () => {
  setOption.value = undefined
  setModalVisible.value = false
}

const openDirectory = async () => {
  if (!setOption.value) return
  const selected = await open({
    directory: true,
    title: '选择缓存目录'
  })
  if (selected) {
    setOption.value = { label: setOption.value.label!, value: selected }
  }
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
        <input
          class="card flex-1 min-w-0 truncate px-2 py-1"
          :value="option.value"
          readonly
        />
        <ActionButton theme="info" @click="setPath(option)">设置</ActionButton>
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
      <span class="font-bold px-1">用户配置</span>
      <span>缓存并退出登录?</span>
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

  <Modal
    v-model="setModalVisible"
    class="w-80"
    title="设置缓存目录"
    @confirm="handleSetPath"
    @cancel="handleSetModalCancel">
    <div class="px-4 space-y-3">
      <div>
        <div class="text-sm text-zinc-500">选择 {{ setOption?.label }}缓存目录</div>
      </div>
      <div class="flex gap-2">
        <input
          class="card flex-1 min-w-0 px-2 py-1"
          :value="setOption?.value || ''"
          readonly
          placeholder="尚未选择目录"
        />
        <ActionButton theme="info" @click="openDirectory">选择</ActionButton>
      </div>
    </div>
  </Modal>
</template>
