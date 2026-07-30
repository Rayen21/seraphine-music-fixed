<script lang="ts" setup>
import { useUpdaterStore } from '@/stores/updater'
import { invoke } from '@/utils/tools'

const updaterStore = useUpdaterStore()

onMounted(() => {
  // 注册设备
  invoke('api_register_dev')

  // 启动时静默检查更新
  updaterStore.checkUpdate(true)
})
</script>

<template>
  <RouterView />
</template>
