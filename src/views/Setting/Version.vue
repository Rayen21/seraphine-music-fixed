<script lang="ts" setup>
import ActionButton from '@/components/ActionButton.vue'
import { useSettingStore } from '@/stores/setting'
import { useUpdaterStore } from '@/stores/updater'
import { formatFileSize } from '@/utils/tools'

const settingStore = useSettingStore()
const updaterStore = useUpdaterStore()

const handleCheckUpdate = () => {
  updaterStore.checkUpdate()
}

const handleDownload = () => {
  updaterStore.startDownload()
}

const handleInstall = () => {
  updaterStore.installUpdate()
}
</script>

<template>
  <div class="flex text-base">
    <div class="font-bold w-40 shrink-0">关于 Seraphine:</div>

    <div class="space-y-3">
      <!-- 当前版本 + 检查更新按钮 -->
      <div class="flex items-center gap-3">
        <div>当前版本 {{ settingStore.version }}</div>

        <ActionButton
          theme="success"
          :disabled="updaterStore.checking || updaterStore.downloading"
          @click="handleCheckUpdate">
          {{ updaterStore.checking ? '检查中...' : '检查更新' }}
        </ActionButton>
      </div>

      <!-- 已是最新版本 -->
      <div v-if="updaterStore.checked && !updaterStore.updateInfo?.has_update" class="text-gray-400">
        已是最新版本
      </div>

      <!-- 发现新版本 -->
      <div v-if="updaterStore.updateInfo?.has_update && !updaterStore.downloaded" class="space-y-2">
        <p class="text-green-500">
          发现新版本 {{ updaterStore.updateInfo.latest_version }}
          <span class="text-gray-400 text-sm">
            ({{ formatFileSize(updaterStore.updateInfo.file_size ?? 0) }})
          </span>
        </p>

        <!-- 未开始下载时显示下载按钮 -->
        <ActionButton v-if="!updaterStore.downloading" theme="success" @click="handleDownload">
          下载更新
        </ActionButton>

        <!-- 下载进度 -->
        <div v-if="updaterStore.downloading" class="space-y-1">
          <div class="flex items-center justify-between text-sm text-gray-400">
            <span>正在下载...</span>
            <span>{{ updaterStore.progressPercent }}%</span>
          </div>
          <div class="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700">
            <div
              class="h-full bg-green-500 rounded-full transition-all duration-300"
              :style="{ width: updaterStore.progressPercent + '%' }" />
          </div>
          <div class="flex items-center justify-between text-xs text-gray-400">
            <span>
              {{ formatFileSize(updaterStore.downloadProgress?.downloaded ?? 0) }}
              /
              {{ formatFileSize(updaterStore.downloadProgress?.total ?? 0) }}
            </span>
            <span v-if="updaterStore.downloadProgress?.speed">
              {{ formatFileSize(updaterStore.downloadProgress.speed) }}/s
            </span>
          </div>
        </div>
      </div>

      <!-- 下载完成 -->
      <div v-if="updaterStore.downloaded" class="space-y-2">
        <p class="text-green-500">下载完成，可安装更新</p>
        <ActionButton theme="success" @click="handleInstall"> 安装更新 </ActionButton>
      </div>
    </div>
  </div>
</template>
